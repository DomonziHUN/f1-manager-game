const { db } = require('../config/database');
const RaceEngine = require('../race-engine/RaceEngine');
const { v4: uuidv4 } = require('uuid');

class RaceService {
    constructor(io) {
        this.io = io;
        this.activeRaces = new Map(); // raceId -> RaceInstance
    }
    
    joinRace(socket, data) {
        const { raceId, userId } = data;
        
        let race = this.activeRaces.get(raceId);
        
        if (!race) {
            // Create new race instance
            race = {
                id: raceId,
                players: new Map(),
                engine: null,
                state: 'waiting', // waiting, countdown, racing, finished
                interval: null
            };
            this.activeRaces.set(raceId, race);
        }
        
        socket.join(raceId);
        race.players.set(userId, {
            socketId: socket.id,
            odataatId: odataatId,
            ready: false
        });
        
        socket.raceId = raceId;
        socket.odataatId = odataatId;
        
        console.log(`Player ${userId} joined race ${raceId}`);
        
        // If both players joined, prepare the race
        if (race.players.size === 2) {
            this.prepareRace(raceId);
        }
    }
    
    async prepareRace(raceId) {
        const race = this.activeRaces.get(raceId);
        if (!race) return;
        
        const playerIds = Array.from(race.players.keys());
        
        // Load player data
        const playersData = [];
        for (const odataatId of playerIds) {
            const playerData = this.loadPlayerRaceData(userId);
            playersData.push(playerData);
        }
        
        // Create race engine
        race.engine = new RaceEngine({
            raceId,
            track: { id: 'silverstone', name: 'Silverstone', laps: 5 },
            players: playersData
        });
        
        race.state = 'countdown';
        
        // Broadcast race info
        this.io.to(raceId).emit('race:prepare', {
            raceId,
            players: playersData.map(p => ({
                odataatId: p.userId,
                username: p.username,
                pilots: p.pilots.map(pilot => ({
                    id: pilot.id,
                    name: pilot.name,
                    team: pilot.team
                }))
            })),
            track: race.engine.track,
            totalCars: 20
        });
        
        // Countdown
        for (let i = 3; i > 0; i--) {
            this.io.to(raceId).emit('race:countdown', { seconds: i });
            await this.sleep(1000);
        }
        
        // Start race
        this.startRace(raceId);
    }
    
    loadPlayerRaceData(userId) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        
        const pilots = db.prepare(`
            SELECT p.*, up.level, up.speed_bonus, up.cornering_bonus, up.overtaking_bonus,
                   CASE WHEN up.is_active_slot_1 = 1 THEN 1 ELSE 2 END as slot
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ? AND (up.is_active_slot_1 = 1 OR up.is_active_slot_2 = 1)
        `).all(userId);
        
        const carParts = db.prepare(`
            SELECT cp.*, ucp.level
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.user_id = ? AND ucp.is_equipped = 1
        `).all(userId);
        
        // Calculate total car stats from parts
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
            carStats.speed += part.speed_bonus * part.level;
            carStats.acceleration += part.acceleration_bonus * part.level;
            carStats.downforce += part.downforce_bonus * part.level;
            carStats.reliability += part.reliability_bonus * part.level;
            carStats.pitStopBonus += part.pit_stop_bonus * part.level;
            carStats.tireWearReduction += part.tire_wear_reduction * part.level;
            carStats.ersEfficiency += part.ers_efficiency_bonus * part.level;
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
        
        this.io.to(raceId).emit('race:start');
        
        // Game loop: 20 ticks per second
        race.interval = setInterval(() => {
            const snapshot = race.engine.tick();
            
            this.io.to(raceId).emit('race:state', snapshot);
            
            if (race.engine.isFinished()) {
                this.endRace(raceId);
            }
        }, 50); // 50ms = 20 ticks/sec
    }
    
    handleCommand(socket, data) {
        const { raceId, carId, command } = data;
        const race = this.activeRaces.get(raceId);
        
        if (!race || !race.engine) return;
        
        race.engine.handleCommand(carId, command);
    }
    
    handleDisconnect(socket) {
        if (socket.raceId) {
            const race = this.activeRaces.get(socket.raceId);
            if (race) {
                // Notify other player
                this.io.to(socket.raceId).emit('race:player_disconnected', {
                    odataatId: socket.userId
                });
                
                // End race if ongoing
                if (race.state === 'racing') {
                    this.endRace(socket.raceId, socket.userId);
                }
            }
        }
    }
    
    async endRace(raceId, disconnectedPlayer = null) {
        const race = this.activeRaces.get(raceId);
        if (!race) return;
        
        if (race.interval) {
            clearInterval(race.interval);
        }
        
        race.state = 'finished';
        
        const results = race.engine.getResults();
        
        // Update database
        const playerIds = Array.from(race.players.keys());
        
        if (playerIds.length === 2) {
            const winnerId = disconnectedPlayer 
                ? playerIds.find(id => id !== disconnectedPlayer)
                : results.winnerId;
            
            // Save race history
            db.prepare(`
                INSERT INTO race_history (id, player1_id, player2_id, winner_id, league_id, track_name, player1_points, player2_points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                uuidv4(),
                playerIds[0],
                playerIds[1],
                winnerId,
                1, // league_id
                race.engine.track.name,
                results.player1Points,
                results.player2Points
            );
            
            // Update player stats and league points
            for (const odataatId of playerIds) {
                const isWinner = odataatId === winnerId;
                const league = db.prepare('SELECT * FROM leagues WHERE id = (SELECT current_league FROM users WHERE id = ?)').get(userId);
                
                const pointChange = isWinner ? league.win_points : -league.lose_points;
                
                db.prepare(`
                    UPDATE users 
                    SET total_races = total_races + 1,
                        total_wins = total_wins + ?,
                        league_points = MAX(0, league_points + ?)
                    WHERE id = ?
                `).run(isWinner ? 1 : 0, pointChange, userId);
                
                // Check for league promotion/demotion
                this.checkLeagueChange(userId);
            }
        }
        
        // Broadcast results
        this.io.to(raceId).emit('race:end', results);
        
        // Cleanup after delay
        setTimeout(() => {
            this.activeRaces.delete(raceId);
        }, 30000);
    }
    
    checkLeagueChange(userId) {
        const user = db.prepare('SELECT current_league, league_points FROM users WHERE id = ?').get(userId);
        const leagues = db.prepare('SELECT * FROM leagues ORDER BY id').all();
        
        // Find appropriate league based on points
        let newLeague = 1;
        for (const league of leagues) {
            if (user.league_points >= league.min_points) {
                newLeague = league.id;
            }
        }
        
        if (newLeague !== user.current_league) {
            db.prepare('UPDATE users SET current_league = ? WHERE id = ?').run(newLeague, userId);
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = RaceService;