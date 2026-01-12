const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

class SocketHandler {
    constructor(server) {
        this.io = new Server(server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        // Store user socket mappings
        this.userSockets = new Map();
        this.socketUsers = new Map();
        
        this.setupEventHandlers();
        console.log('🔌 WebSocket server initialized on port', server.address()?.port || 'unknown');
    }
    
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log('🔌 NEW CLIENT CONNECTED:', socket.id);
            console.log('📊 Total clients:', this.io.engine.clientsCount);
            
            // Test event
            socket.emit('welcome', { message: 'Connected to F1 Manager WebSocket!' });
            
            // Authentication
            socket.on('authenticate', (data) => {
                console.log('🔐 Authentication request from:', socket.id);
                this.handleAuthentication(socket, data);
            });
            
            // Matchmaking events
            socket.on('join_queue', (data) => {
                this.handleJoinQueue(socket, data);
            });
            
            socket.on('leave_queue', () => {
                this.handleLeaveQueue(socket);
            });
            
            socket.on('find_match', () => {
                this.handleFindMatch(socket);
            });
            
            // Disconnect
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    
    handleAuthentication(socket, data) {
        try {
            const { token } = data;
            
            if (!token) {
                socket.emit('auth_error', { error: 'No token provided' });
                return;
            }
            
            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.userId || decoded.id;
            
            // Get user from database
            const user = db.prepare('SELECT id, username, current_league FROM users WHERE id = ?').get(userId);
            
            if (!user) {
                socket.emit('auth_error', { error: 'User not found' });
                return;
            }
            
            // Store user-socket mapping
            this.userSockets.set(userId, socket.id);
            this.socketUsers.set(socket.id, userId);
            
            socket.userId = userId;
            socket.user = user;
            
            socket.emit('authenticated', { 
                success: true, 
                user: { 
                    id: user.id, 
                    username: user.username, 
                    league: user.current_league 
                } 
            });
            
            console.log(`✅ User authenticated: ${user.username} (${userId})`);
            
        } catch (error) {
            console.error('❌ Authentication error:', error);
            socket.emit('auth_error', { error: 'Invalid token' });
        }
    }
    
    handleJoinQueue(socket, data) {
        if (!socket.userId) {
            socket.emit('queue_error', { error: 'Not authenticated' });
            return;
        }
        
        try {
            const userId = socket.userId;
            
            // Check if user has 2 active pilots
            const activePilots = db.prepare(`
                SELECT pilot_id FROM user_pilots 
                WHERE user_id = ? AND (is_active_slot_1 = 1 OR is_active_slot_2 = 1)
            `).all(userId);
            
            if (activePilots.length < 2) {
                socket.emit('queue_error', { error: 'You need 2 active pilots to join matchmaking' });
                return;
            }
            
            // Get user's league and car stats
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
            
            // Check if already in queue
            const existingQueue = db.prepare(`
                SELECT id FROM matchmaking_queue WHERE user_id = ?
            `).get(userId);
            
            if (existingQueue) {
                socket.emit('queue_error', { error: 'Already in matchmaking queue' });
                return;
            }
            
            // Add to queue
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
            
            // Get queue count
            const queueCount = db.prepare(`
                SELECT COUNT(*) as count FROM matchmaking_queue 
                WHERE league_id = ? AND status = 'waiting'
            `).get(user.current_league);
            
            socket.emit('queue_joined', {
                success: true,
                queueId: queueId,
                league: user.current_league,
                playersInQueue: queueCount.count,
                estimatedWaitTime: '30-60 seconds'
            });
            
            console.log(`🎮 User ${socket.user.username} joined queue (League ${user.current_league})`);
            
            // Notify all players in same league about queue count update
            this.broadcastQueueUpdate(user.current_league);
            
            // Try to find match immediately
            setTimeout(() => this.tryMatchmaking(user.current_league), 1000);
            
        } catch (error) {
            console.error('❌ Join queue error:', error);
            socket.emit('queue_error', { error: 'Failed to join queue' });
        }
    }
    
    handleLeaveQueue(socket) {
        if (!socket.userId) {
            return;
        }
        
        try {
            const result = db.prepare(`
                DELETE FROM matchmaking_queue WHERE user_id = ?
            `).run(socket.userId);
            
            if (result.changes > 0) {
                socket.emit('queue_left', { success: true });
                console.log(`🚪 User ${socket.user.username} left queue`);
                
                // Update queue count for remaining players
                const user = db.prepare('SELECT current_league FROM users WHERE id = ?').get(socket.userId);
                if (user) {
                    this.broadcastQueueUpdate(user.current_league);
                }
            }
            
        } catch (error) {
            console.error('❌ Leave queue error:', error);
        }
    }
    
    handleFindMatch(socket) {
        if (!socket.userId) {
            return;
        }
        
        const user = db.prepare('SELECT current_league FROM users WHERE id = ?').get(socket.userId);
        if (user) {
            this.tryMatchmaking(user.current_league);
        }
    }
    
    tryMatchmaking(leagueId) {
        try {
            // Get all players in queue for this league
            const playersInQueue = db.prepare(`
                SELECT * FROM matchmaking_queue 
                WHERE league_id = ? AND status = 'waiting'
                ORDER BY queued_at ASC
            `).all(leagueId);
            
            if (playersInQueue.length < 2) {
                console.log(`⏳ Not enough players in League ${leagueId} queue (${playersInQueue.length}/2)`);
                return;
            }
            
            // Match first two players
            const player1 = playersInQueue[0];
            const player2 = playersInQueue[1];
            
            // Create match
            const { v4: uuidv4 } = require('uuid');
            const matchId = uuidv4();
            
            // Get random track for this league
            const track = db.prepare(`
                SELECT * FROM tracks 
                WHERE unlock_league <= ? 
                ORDER BY RANDOM() 
                LIMIT 1
            `).get(leagueId);
            
            // Create active match
            db.prepare(`
                INSERT INTO active_matches (
                    id, player1_id, player2_id, league_id, track_id, status
                ) VALUES (?, ?, ?, ?, ?, 'preparing')
            `).run(matchId, player1.user_id, player2.user_id, leagueId, track.id);
            
            // Remove both players from queue
            db.prepare(`
                DELETE FROM matchmaking_queue WHERE user_id IN (?, ?)
            `).run(player1.user_id, player2.user_id);
            
            // Get player usernames
            const player1User = db.prepare('SELECT username FROM users WHERE id = ?').get(player1.user_id);
            const player2User = db.prepare('SELECT username FROM users WHERE id = ?').get(player2.user_id);
            
            // Notify both players
            const matchData = {
                matchId: matchId,
                track: {
                    id: track.id,
                    name: track.name,
                    country: track.country,
                    laps: track.total_laps,
                    length: track.track_length_km
                }
            };
            
            // Send to player 1
            const player1Socket = this.userSockets.get(player1.user_id);
            if (player1Socket) {
                this.io.to(player1Socket).emit('match_found', {
                    ...matchData,
                    opponent: {
                        username: player2User.username,
                        league: leagueId,
                        rating: player2.rating
                    }
                });
            }
            
            // Send to player 2
            const player2Socket = this.userSockets.get(player2.user_id);
            if (player2Socket) {
                this.io.to(player2Socket).emit('match_found', {
                    ...matchData,
                    opponent: {
                        username: player1User.username,
                        league: leagueId,
                        rating: player1.rating
                    }
                });
            }
            
            console.log(`🏁 Match created: ${player1User.username} vs ${player2User.username} on ${track.name}`);
            
            // Update queue count for remaining players
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
            
            // Find all sockets for users in this league who are in queue
            const usersInQueue = db.prepare(`
                SELECT DISTINCT mq.user_id 
                FROM matchmaking_queue mq
                WHERE mq.league_id = ? AND mq.status = 'waiting'
            `).all(leagueId);
            
            usersInQueue.forEach(user => {
                const socketId = this.userSockets.get(user.user_id);
                if (socketId) {
                    this.io.to(socketId).emit('queue_update', {
                        playersInQueue: queueCount.count,
                        league: leagueId
                    });
                }
            });
            
        } catch (error) {
            console.error('❌ Queue update error:', error);
        }
    }
    
    handleDisconnect(socket) {
        if (socket.userId) {
            console.log(`🔌 User ${socket.user?.username || socket.userId} disconnected`);
            
            // Remove from queue if in queue
            this.handleLeaveQueue(socket);
            
            // Clean up mappings
            this.userSockets.delete(socket.userId);
            this.socketUsers.delete(socket.id);
        } else {
            console.log('🔌 Anonymous client disconnected:', socket.id);
        }
    }
    
    // Utility method to send message to specific user
    sendToUser(userId, event, data) {
        const socketId = this.userSockets.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
            return true;
        }
        return false;
    }
}

module.exports = SocketHandler;