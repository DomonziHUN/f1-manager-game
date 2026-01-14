// backend/websocket/nativeSocketHandler.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');
const RaceService = require('../services/RaceService');
const QualifyingEngine = require('../race-engine/QualifyingEngine');

class NativeSocketHandler {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });

        this.userSockets = new Map();
        this.socketUsers = new Map();
        this.raceSockets = new Map();

        const ioAdapter = {
            to: (raceId) => ({
                emit: (event, data) => this.broadcastToRace(raceId, event, data)
            })
        };
        this.raceService = new RaceService(ioAdapter);

        this.setupEventHandlers();
        console.log('🔌 Native WebSocket server initialized');
    }

    setupEventHandlers() {
        this.wss.on('connection', (socket, request) => {
            console.log('🔌 NEW CLIENT CONNECTED from:', request.socket.remoteAddress);
            console.log('📊 Total clients:', this.wss.clients.size);

            this.sendToSocket(socket, 'welcome', { message: 'Connected to F1 Manager WebSocket!' });

            socket.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(socket, message);
                } catch (error) {
                    console.error('❌ Failed to parse message:', error);
                    this.sendToSocket(socket, 'error', { error: 'Invalid JSON' });
                }
            });

            socket.on('close', () => this.handleDisconnect(socket));
            socket.on('error', (error) => console.error('❌ WebSocket error:', error));
        });
    }

    handleMessage(socket, message) {
        if (message.token && !message.event) {
            this.handleAuthentication(socket, message);
            return;
        }

        const { event, data } = message;
        if (!event) {
            this.sendToSocket(socket, 'error', { error: 'No event specified' });
            return;
        }

        switch (event) {
            case 'authenticate':
                this.handleAuthentication(socket, data);
                break;

            // MATCHMAKING
            case 'join_queue':
                this.handleJoinQueue(socket, data);
                break;
            case 'leave_queue':
                this.handleLeaveQueue(socket);
                break;
            case 'find_match':
                this.handleFindMatch(socket);
                break;

            // RACE PREPARATION
            case 'race_preparation':
                this.handleRacePreparation(socket, data);
                break;
            case 'request_qualifying_results':
                this.handleQualifyingRequest(socket, data);
                break;

            // RACE
            case 'race_join':
                this.handleRaceJoin(socket, data);
                break;
            case 'race_command':
                this.handleRaceCommand(socket, data);
                break;
            case 'race_leave':
                this.handleRaceLeave(socket);
                break;

            default:
                console.log('⚠️ Unknown event:', event);
                this.sendToSocket(socket, 'error', { error: 'Unknown event: ' + event });
        }
    }

    // =========================
    // AUTH
    // =========================
    handleAuthentication(socket, data) {
        try {
            const { token } = data || {};
            if (!token) {
                this.sendToSocket(socket, 'auth_error', { error: 'No token provided' });
                return;
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id;

            const user = db.prepare('SELECT id, username, current_league FROM users WHERE id = ?').get(userId);
            if (!user) {
                this.sendToSocket(socket, 'auth_error', { error: 'User not found' });
                return;
            }

            this.userSockets.set(userId, socket);
            this.socketUsers.set(socket, userId);
            socket.userId = userId;
            socket.user = user;

            this.sendToSocket(socket, 'authenticated', {
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    league: user.current_league
                }
            });

            console.log(`✅ User authenticated: ${user.username} (${userId})`);

            try {
                const leagueId = user.current_league;
                const queueCount = db.prepare(`
                    SELECT COUNT(*) as count FROM matchmaking_queue 
                    WHERE league_id = ? AND status = 'waiting'
                `).get(leagueId);

                this.sendToSocket(socket, 'queue_update', {
                    playersInQueue: queueCount.count,
                    league: leagueId
                });
            } catch (e) {
                console.error('❌ Failed to send initial queue_update:', e);
            }

        } catch (error) {
            console.error('❌ Authentication error:', error);
            this.sendToSocket(socket, 'auth_error', { error: 'Invalid token' });
        }
    }

    // =========================
    // MATCHMAKING (DB alapú)
    // =========================
    handleJoinQueue(socket, _data) {
        if (!socket.userId) {
            this.sendToSocket(socket, 'queue_error', { error: 'Not authenticated' });
            return;
        }

        try {
            const userId = socket.userId;

            const activePilots = db.prepare(`
                SELECT pilot_id FROM user_pilots 
                WHERE user_id = ? AND (is_active_slot_1 = 1 OR is_active_slot_2 = 1)
            `).all(userId);

            if (activePilots.length < 2) {
                this.sendToSocket(socket, 'queue_error', { error: 'You need 2 active pilots to join matchmaking' });
                return;
            }

            const user = db.prepare(`
                SELECT current_league, league_points FROM users WHERE id = ?
            `).get(userId);

            const carStats = db.prepare(`
                SELECT 
                    COALESCE(SUM(cp.speed_bonus), 0) as speed,
                    COALESCE(SUM(cp.acceleration_bonus), 0) as acceleration,
                    COALESCE(SUM(cp.downforce_bonus), 0) as downforce,
                    COALESCE(SUM(cp.reliability_bonus), 0) as reliability,
                    COALESCE(SUM(cp.pit_stop_bonus), 0) as pit_stop_speed,
                    COALESCE(SUM(cp.tire_wear_reduction), 0) as tire_wear_reduction,
                    COALESCE(SUM(cp.ers_efficiency_bonus), 0) as ers_efficiency
                FROM user_car_parts ucp
                JOIN car_parts cp ON ucp.part_id = cp.id
                WHERE ucp.user_id = ? AND ucp.is_equipped = 1
            `).get(userId);

            const existingQueue = db.prepare(`
                SELECT id FROM matchmaking_queue WHERE user_id = ?
            `).get(userId);

            if (existingQueue) {
                this.sendToSocket(socket, 'queue_error', { error: 'Already in matchmaking queue' });
                return;
            }

            const { v4: uuidv4 } = require('uuid');
            const queueId = uuidv4();

            db.prepare(`
                INSERT INTO matchmaking_queue (
                    id, user_id, league_id, pilot1_id, pilot2_id, car_stats, rating
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                queueId,
                userId,
                user.current_league,
                activePilots[0].pilot_id,
                activePilots[1].pilot_id,
                JSON.stringify(carStats),
                user.league_points
            );

            const queueCount = db.prepare(`
                SELECT COUNT(*) as count FROM matchmaking_queue 
                WHERE league_id = ? AND status = 'waiting'
            `).get(user.current_league);

            this.sendToSocket(socket, 'queue_joined', {
                success: true,
                queueId: queueId,
                league: user.current_league,
                playersInQueue: queueCount.count,
                estimatedWaitTime: '30-60 seconds'
            });

            console.log(`🎮 User ${socket.user.username} joined queue (League ${user.current_league})`);

            this.broadcastQueueUpdate(user.current_league);
            setTimeout(() => this.tryMatchmaking(user.current_league), 1000);
        } catch (error) {
            console.error('❌ Join queue error:', error);
            this.sendToSocket(socket, 'queue_error', { error: 'Failed to join queue' });
        }
    }

    handleLeaveQueue(socket) {
        if (!socket.userId) return;

        try {
            const result = db.prepare(`
                DELETE FROM matchmaking_queue WHERE user_id = ?
            `).run(socket.userId);

            if (result.changes > 0) {
                this.sendToSocket(socket, 'queue_left', { success: true });
                console.log(`🚪 User ${socket.user.username} left queue`);

                const user = db.prepare('SELECT current_league FROM users WHERE id = ?').get(socket.userId);
                if (user) this.broadcastQueueUpdate(user.current_league);
            }
        } catch (error) {
            console.error('❌ Leave queue error:', error);
        }
    }

    handleFindMatch(socket) {
        if (!socket.userId) return;
        const user = db.prepare('SELECT current_league FROM users WHERE id = ?').get(socket.userId);
        if (user) this.tryMatchmaking(user.current_league);
    }

    tryMatchmaking(leagueId) {
        try {
            const playersInQueue = db.prepare(`
                SELECT * FROM matchmaking_queue 
                WHERE league_id = ? AND status = 'waiting'
                ORDER BY queued_at ASC
            `).all(leagueId);

            if (playersInQueue.length < 2) {
                console.log(`⏳ Not enough players in League ${leagueId} queue (${playersInQueue.length}/2)`);
                return;
            }

            const player1 = playersInQueue[0];
            const player2 = playersInQueue[1];

            const { v4: uuidv4 } = require('uuid');
            const matchId = uuidv4();

            const track = db.prepare(`
                SELECT * FROM tracks 
                WHERE unlock_league <= ? 
                ORDER BY RANDOM() 
                LIMIT 1
            `).get(leagueId);

            const weatherTypes = ['dry', 'dry', 'dry', 'cloudy', 'light_rain'];
            const weather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
            const seed = Math.floor(Math.random() * 2147483647);

            db.prepare(`
                INSERT INTO active_matches (
                    id, player1_id, player2_id, league_id, track_id, status, weather
                ) VALUES (?, ?, ?, ?, ?, 'preparing', ?)
            `).run(matchId, player1.user_id, player2.user_id, leagueId, track.id, weather);

            db.prepare(`
                DELETE FROM matchmaking_queue WHERE user_id IN (?, ?)
            `).run(player1.user_id, player2.user_id);

            const player1User = db.prepare('SELECT username FROM users WHERE id = ?').get(player1.user_id);
            const player2User = db.prepare('SELECT username FROM users WHERE id = ?').get(player2.user_id);

            const matchData = {
                matchId,
                track: {
                    id: track.id,
                    name: track.name,
                    country: track.country,
                    laps: track.total_laps,
                    length: track.track_length_km
                },
                weather,
                seed
            };

            const player1Socket = this.userSockets.get(player1.user_id);
            if (player1Socket) {
                this.sendToSocket(player1Socket, 'match_found', {
                    ...matchData,
                    opponent: {
                        username: player2User.username,
                        league: leagueId,
                        rating: player2.rating
                    }
                });
            }

            const player2Socket = this.userSockets.get(player2.user_id);
            if (player2Socket) {
                this.sendToSocket(player2Socket, 'match_found', {
                    ...matchData,
                    opponent: {
                        username: player1User.username,
                        league: leagueId,
                        rating: player1.rating
                    }
                });
            }

            console.log(`🏁 Match created: ${player1User.username} vs ${player2User.username} on ${track.name}`);

            this.broadcastQueueUpdate(leagueId);
        } catch (error) {
            console.error('❌ Matchmaking error:', error);
        }
    }

    broadcastQueueUpdate(leagueId) {
        try {
            const queueCount = db.prepare(`
                SELECT COUNT(*) as count FROM matchmaking_queue 
                WHERE league_id = ? AND status = 'waiting'
            `).get(leagueId);

            for (const [userId, socket] of this.userSockets.entries()) {
                const user = socket.user;
                if (!user) continue;
                if (user.current_league !== leagueId) continue;

                this.sendToSocket(socket, 'queue_update', {
                    playersInQueue: queueCount.count,
                    league: leagueId
                });
            }
        } catch (error) {
            console.error('❌ Queue update error:', error);
        }
    }

    // =========================
    // RACE PREPARATION
    // =========================
    handleRacePreparation(socket, data) {
        if (!socket.userId) {
            this.sendToSocket(socket, 'error', { error: 'Not authenticated' });
            return;
        }

        try {
            const matchId = data?.matchId;
            if (!matchId) {
                this.sendToSocket(socket, 'error', { error: 'No matchId in race_preparation' });
                return;
            }

            const match = db.prepare('SELECT * FROM active_matches WHERE id = ?').get(matchId);
            if (!match) {
                this.sendToSocket(socket, 'error', { error: 'Match not found' });
                return;
            }

            let playerTag = null;
            if (match.player1_id === socket.userId) playerTag = 'player1';
            else if (match.player2_id === socket.userId) playerTag = 'player2';
            else {
                this.sendToSocket(socket, 'error', { error: 'User not in this match' });
                return;
            }

            let state = {};
            if (match.race_state) {
                try { state = JSON.parse(match.race_state); } catch (e) { state = {}; }
            }
            if (!state.preparation) state.preparation = {};
            if (!state.preparation[playerTag]) state.preparation[playerTag] = {};

            state.preparation[playerTag].tires = {
                '1': (data.pilot1_tire || 'medium').toLowerCase(),
                '2': (data.pilot2_tire || 'medium').toLowerCase()
            };
            state.preparation[playerTag].ready = true;

            db.prepare('UPDATE active_matches SET race_state = ? WHERE id = ?')
              .run(JSON.stringify(state), matchId);

            this.sendToSocket(socket, 'race_preparation_update', {
                success: true,
                opponent_ready: false
            });

            const otherTag = playerTag === 'player1' ? 'player2' : 'player1';
            const bothReady =
                state.preparation[playerTag]?.ready &&
                state.preparation[otherTag]?.ready;

            if (bothReady) {
                const s1 = this.userSockets.get(match.player1_id);
                const s2 = this.userSockets.get(match.player2_id);
                const payload = { matchId };

                if (s1) this.sendToSocket(s1, 'qualifying_start', payload);
                if (s2 && s2 !== s1) this.sendToSocket(s2, 'qualifying_start', payload);

                console.log(`🏁 Both players ready, starting qualifying for match ${matchId}`);
            }

        } catch (err) {
            console.error('❌ race_preparation error:', err);
            this.sendToSocket(socket, 'error', { error: 'Failed to save race preparation' });
        }
    }

    // =========================
    // QUALIFYING
    // =========================
    handleQualifyingRequest(socket, data) {
        if (!socket.userId) {
            this.sendToSocket(socket, 'error', { error: 'Not authenticated' });
            return;
        }

        try {
            const matchId = data?.matchId;
            let match;

            if (matchId) {
                match = db.prepare('SELECT * FROM active_matches WHERE id = ?').get(matchId);
            } else {
                match = db.prepare(`
                    SELECT * FROM active_matches
                    WHERE (player1_id = ? OR player2_id = ?)
                    AND status != 'finished'
                    ORDER BY created_at DESC
                    LIMIT 1
                `).get(socket.userId, socket.userId);
            }

            if (!match) {
                this.sendToSocket(socket, 'error', { error: 'No active match found for qualifying' });
                return;
            }

            let state = {};
            if (match.race_state) {
                try { state = JSON.parse(match.race_state); } catch (e) { state = {}; }
            }

            if (!state.qualifying) {
                const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(match.track_id);
                const weather = match.weather || 'dry';

                const prep = state.preparation || {};
                const p1Tires = (prep.player1 && prep.player1.tires) || {};
                const p2Tires = (prep.player2 && prep.player2.tires) || {};

                const player1Data = this.raceService.loadPlayerRaceData(match.player1_id);
                const player2Data = this.raceService.loadPlayerRaceData(match.player2_id);

                player1Data.selectedTires = p1Tires;
                player2Data.selectedTires = p2Tires;

                const players = [player1Data, player2Data];

                const engine = new QualifyingEngine({
                    track: {
                        id: track.id,
                        name: track.name,
                        laps: track.total_laps
                    },
                    weather,
                    players
                });

                const result = engine.run();
                state.qualifying = result.grid;

                db.prepare('UPDATE active_matches SET race_state = ? WHERE id = ?')
                  .run(JSON.stringify(state), match.id);
            }

            const payload = {
                matchId: match.id,
                grid: state.qualifying
            };

            const s1 = this.userSockets.get(match.player1_id);
            const s2 = this.userSockets.get(match.player2_id);

            if (s1) this.sendToSocket(s1, 'qualifying_results', payload);
            if (s2 && s2 !== s1) this.sendToSocket(s2, 'qualifying_results', payload);

            console.log(`🏁 Sent qualifying_results for match ${match.id}`);

        } catch (err) {
            console.error('❌ Qualifying error:', err);
            this.sendToSocket(socket, 'error', { error: 'Failed to run qualifying' });
        }
    }

    // =========================
    // RACE HANDLING
    // =========================
    handleRaceJoin(socket, data) {
        if (!socket.userId) {
            this.sendToSocket(socket, 'race_error', { error: 'Not authenticated' });
            return;
        }

        const { raceId, matchId } = data || {};
        const id = raceId || matchId;
        if (!id) {
            this.sendToSocket(socket, 'race_error', { error: 'No raceId/matchId provided' });
            return;
        }

        socket.raceId = id;
        this.addSocketToRace(id, socket);

        this.raceService.joinRace(socket, {
            raceId: id,
            userId: socket.userId
        });
    }

    handleRaceCommand(socket, data) {
        if (!socket.raceId) {
            this.sendToSocket(socket, 'race_error', { error: 'Not in a race' });
            return;
        }

        const { carId, command } = data || {};
        if (!carId || !command) {
            this.sendToSocket(socket, 'race_error', { error: 'Invalid race command' });
            return;
        }

        this.raceService.handleCommand(socket, {
            raceId: socket.raceId,
            carId,
            command
        });
    }

    handleRaceLeave(socket) {
        if (!socket.raceId) return;
        this.raceService.handleDisconnect(socket);
        this.removeSocketFromRace(socket.raceId, socket);
        delete socket.raceId;
    }

    addSocketToRace(raceId, socket) {
        if (!this.raceSockets.has(raceId)) {
            this.raceSockets.set(raceId, new Set());
        }
        this.raceSockets.get(raceId).add(socket);
    }

    removeSocketFromRace(raceId, socket) {
        const set = this.raceSockets.get(raceId);
        if (!set) return;
        set.delete(socket);
        if (set.size === 0) this.raceSockets.delete(raceId);
    }

    broadcastToRace(raceId, event, data) {
        const sockets = this.raceSockets.get(raceId);
        if (!sockets) return;
        for (const socket of sockets) this.sendToSocket(socket, event, data);
    }

    // =========================
    // DISCONNECT / SEND
    // =========================
    handleDisconnect(socket) {
        if (socket.userId) {
            console.log(`🔌 User ${socket.user?.username || socket.userId} disconnected`);

            this.handleLeaveQueue(socket);

            if (socket.raceId) {
                this.raceService.handleDisconnect(socket);
                this.removeSocketFromRace(socket.raceId, socket);
            }

            this.userSockets.delete(socket.userId);
            this.socketUsers.delete(socket);
        } else {
            console.log('🔌 Anonymous client disconnected');
        }
    }

    sendToSocket(socket, event, data) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ event, data }));
        }
    }

    sendToUser(userId, event, data) {
        const socket = this.userSockets.get(userId);
        if (!socket) return false;
        this.sendToSocket(socket, event, data);
        return true;
    }
}

module.exports = NativeSocketHandler;