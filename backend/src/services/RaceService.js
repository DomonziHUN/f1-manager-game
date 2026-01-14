// backend/services/RaceService.js
const { db } = require('../config/database');
const RaceEngine = require('../race-engine/RaceEngine');
const { v4: uuidv4 } = require('uuid');

class RaceService {
    constructor(io) {
        this.io = io;
        this.activeRaces = new Map(); // raceId -> { players, engine, state, interval }
    }

    joinRace(socket, data) {
        const { raceId, userId } = data;

        if (!raceId || !userId) {
            console.warn('joinRace: raceId vagy userId hiányzik', data);
            return;
        }

        let race = this.activeRaces.get(raceId);

        if (!race) {
            race = {
                id: raceId,
                players: new Map(), // userId -> { socketId, ready }
                engine: null,
                state: 'waiting',
                interval: null
            };
            this.activeRaces.set(raceId, race);
        }

        socket.join && socket.join(raceId); // csak Socket.IO esetén van értelme
        race.players.set(userId, {
            socketId: socket.id,
            userId,
            ready: false
        });

        socket.raceId = raceId;
        socket.userId = userId;

        console.log(`Player ${userId} joined race ${raceId}`);

        if (race.players.size === 2) {
            this.prepareRace(raceId).catch(err => {
                console.error('prepareRace error:', err);
            });
        }
    }

    async prepareRace(raceId) {
        const race = this.activeRaces.get(raceId);
        if (!race) return;

        const match = db.prepare(`
            SELECT 
                am.*,
                t.name AS track_name,
                t.total_laps,
                t.tire_wear_factor
            FROM active_matches am
            JOIN tracks t ON am.track_id = t.id
            WHERE am.id = ?
        `).get(raceId);

        if (!match) {
            console.warn(`prepareRace: active_match nem található raceId=${raceId}`);
            return;
        }

        const playerIds = [match.player1_id, match.player2_id];

        const playersData = playerIds.map(userId => this.loadPlayerRaceData(userId));

        race.engine = new RaceEngine({
            raceId,
            track: {
                id: match.track_id,
                name: match.track_name,
                laps: match.total_laps,
                tire_wear_factor: match.tire_wear_factor
            },
            weather: match.weather || 'dry',
            players: playersData
        });

        race.state = 'countdown';

        this.io.to && this.io.to(raceId).emit('race:prepare', {
            raceId,
            players: playersData.map(p => ({
                userId: p.userId,
                username: p.username,
                pilots: p.pilots.map(pilot => ({
                    id: pilot.id,
                    name: pilot.name,
                    team: pilot.team
                }))
            })),
            track: race.engine.track,
            totalCars: race.engine.cars?.size || 20
        });

        for (let i = 3; i > 0; i--) {
            this.io.to && this.io.to(raceId).emit('race:countdown', { seconds: i });
            await this.sleep(1000);
        }

        this.startRace(raceId);
    }

    loadPlayerRaceData(userId) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            throw new Error(`loadPlayerRaceData: user not found: ${userId}`);
        }

        const pilots = db.prepare(`
            SELECT 
                p.*, 
                up.level, 
                up.speed_bonus, 
                up.cornering_bonus, 
                up.overtaking_bonus,
                CASE WHEN up.is_active_slot_1 = 1 THEN 1 ELSE 2 END as slot
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ? 
              AND (up.is_active_slot_1 = 1 OR up.is_active_slot_2 = 1)
        `).all(userId);

        const carParts = db.prepare(`
            SELECT cp.*, ucp.level
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.user_id = ? AND ucp.is_equipped = 1
        `).all(userId);

        const carStats = {
            speed: 50,
            acceleration: 50,
            downforce: 50,
            reliability: 50,
            pitStopBonus: 0,
            tireWearReduction: 0,
            ersEfficiency: 50
        };

        for (const part of carParts) {
            carStats.speed += (part.speed_bonus || 0) * part.level;
            carStats.acceleration += (part.acceleration_bonus || 0) * part.level;
            carStats.downforce += (part.downforce_bonus || 0) * part.level;
            carStats.reliability += (part.reliability_bonus || 0) * part.level;
            carStats.pitStopBonus += (part.pit_stop_bonus || 0) * part.level;
            carStats.tireWearReduction += (part.tire_wear_reduction || 0) * part.level;
            carStats.ersEfficiency += (part.ers_efficiency_bonus || 0) * part.level;
        }

        return {
            userId,
            username: user.username,
            pilots: pilots.map(p => ({
                id: p.id,
                name: p.name,
                team: p.team,
                slot: p.slot,
                stats: {
                    speed: p.base_speed + (p.speed_bonus * p.level),
                    cornering: p.base_cornering + (p.cornering_bonus * p.level),
                    overtaking: p.base_overtaking + (p.overtaking_bonus * p.level),
                    consistency: p.base_consistency,
                    tireManagement: p.base_tire_management,
                    wetSkill: p.base_wet_skill
                }
            })),
            carStats
        };
    }

    startRace(raceId) {
        const race = this.activeRaces.get(raceId);
        if (!race || !race.engine) return;

        race.state = 'racing';

        this.io.to && this.io.to(raceId).emit('race:start');

        race.interval = setInterval(() => {
            const snapshot = race.engine.tick();

            this.io.to && this.io.to(raceId).emit('race:state', snapshot);

            if (race.engine.isFinished()) {
                this.endRace(raceId).catch(err => {
                    console.error('endRace error:', err);
                });
            }
        }, 50);
    }

    handleCommand(socket, data) {
        const { raceId, carId, command } = data;
        const race = this.activeRaces.get(raceId);
        if (!race || !race.engine) return;

        race.engine.handleCommand(carId, command);
    }

    handleDisconnect(socket) {
        if (!socket.raceId || !socket.userId) return;

        const race = this.activeRaces.get(socket.raceId);
        if (!race) return;

        this.io.to && this.io.to(socket.raceId).emit('race:player_disconnected', {
            userId: socket.userId
        });

        if (race.state === 'racing') {
            this.endRace(socket.raceId, socket.userId).catch(err => {
                console.error('endRace on disconnect error:', err);
            });
        }
    }

    async endRace(raceId, disconnectedPlayerId = null) {
        const race = this.activeRaces.get(raceId);
        if (!race || !race.engine) return;

        if (race.interval) {
            clearInterval(race.interval);
        }

        race.state = 'finished';

        const results = race.engine.getResults();

        const match = db.prepare(`
            SELECT * FROM active_matches WHERE id = ?
        `).get(raceId);

        if (!match) {
            console.warn(`endRace: active_match nem található raceId=${raceId}`);
        }

        const player1Id = match ? match.player1_id : results.player1UserId;
        const player2Id = match ? match.player2_id : results.player2UserId;

        let winnerUserId = null;

        if (disconnectedPlayerId) {
            winnerUserId = (disconnectedPlayerId === player1Id) ? player2Id : player1Id;
        } else {
            if (results.winnerOwner === 'player1') winnerUserId = player1Id;
            if (results.winnerOwner === 'player2') winnerUserId = player2Id;
        }

        const bestPosFor = (owner) => {
            const cars = results.standings.filter(s => s.owner === owner);
            if (!cars.length) return null;
            return Math.min(...cars.map(c => c.position));
        };

        const player1BestPos = bestPosFor('player1');
        const player2BestPos = bestPosFor('player2');

        let leagueId = match ? match.league_id : 1;
        let league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);

        const calcDelta = (userId) => {
            if (!league) return 0;
            if (winnerUserId === null) {
                return league.draw_points || 0;
            }
            if (userId === winnerUserId) return league.win_points;
            return -league.lose_points;
        };

        const player1Delta = calcDelta(player1Id);
        const player2Delta = calcDelta(player2Id);

        const updateUser = (userId, delta, isWinner) => {
            if (!userId) return;
            db.prepare(`
                UPDATE users 
                SET total_races = total_races + 1,
                    total_wins = total_wins + ?,
                    league_points = MAX(0, league_points + ?)
                WHERE id = ?
            `).run(isWinner ? 1 : 0, delta, userId);

            this.checkLeagueChange(userId);
        };

        updateUser(player1Id, player1Delta, winnerUserId && player1Id === winnerUserId);
        updateUser(player2Id, player2Delta, winnerUserId && player2Id === winnerUserId);

        if (match) {
            db.prepare(`
                UPDATE active_matches
                SET status = 'finished',
                    current_lap = ?,
                    race_state = ?
                WHERE id = ?
            `).run(
                race.engine.totalLaps,
                JSON.stringify(results),
                raceId
            );
        }

        db.prepare(`
            INSERT INTO race_history (
                id, 
                player1_id, 
                player2_id, 
                winner_id, 
                league_id, 
                track_id,
                player1_position, 
                player2_position,
                player1_points_change, 
                player2_points_change,
                player1_coins_earned,
                player2_coins_earned,
                total_laps,
                race_duration_seconds,
                race_data
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            player1Id,
            player2Id,
            winnerUserId,
            leagueId,
            match ? match.track_id : null,
            player1BestPos,
            player2BestPos,
            player1Delta,
            player2Delta,
            winnerUserId === player1Id ? 200 : 100,
            winnerUserId === player2Id ? 200 : 100,
            race.engine.totalLaps,
            results.raceTimeSeconds,
            JSON.stringify(results)
        );

        this.io.to && this.io.to(raceId).emit('race:end', results);

        setTimeout(() => {
            this.activeRaces.delete(raceId);
        }, 30000);
    }

    checkLeagueChange(userId) {
        const user = db.prepare('SELECT current_league, league_points FROM users WHERE id = ?').get(userId);
        if (!user) return;

        const leagues = db.prepare('SELECT * FROM leagues ORDER BY id').all();

        let newLeague = user.current_league;
        for (const league of leagues) {
            if (user.league_points >= league.min_points) {
                newLeague = league.id;
            }
        }

        if (newLeague !== user.current_league) {
            db.prepare('UPDATE users SET current_league = ?, highest_league = MAX(highest_league, ?) WHERE id = ?')
              .run(newLeague, newLeague, userId);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = RaceService;