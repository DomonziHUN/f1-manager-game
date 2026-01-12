const { db } = require('../config/database');

class MatchmakingService {
    constructor(io) {
        this.io = io;
        this.queues = {
            1: [], // Bronze League queue
            2: [], // Silver League queue
            3: []  // Gold League queue
        };
        
        // Check for matches every 2 seconds
        setInterval(() => this.processQueues(), 2000);
    }
    
    addToQueue(socket, data) {
        const { userId, leagueId } = data;
        
        // Get user data
        const user = db.prepare(`
            SELECT u.*, 
                   up1.pilot_id as pilot1_id,
                   up2.pilot_id as pilot2_id
            FROM users u
            LEFT JOIN user_pilots up1 ON up1.user_id = u.id AND up1.is_active_slot_1 = 1
            LEFT JOIN user_pilots up2 ON up2.user_id = u.id AND up2.is_active_slot_2 = 1
            WHERE u.id = ?
        `).get(userId);
        
        if (!user) {
            socket.emit('matchmaking:error', { message: 'User not found' });
            return;
        }
        
        if (!user.pilot1_id || !user.pilot2_id) {
            socket.emit('matchmaking:error', { message: 'Please select 2 active pilots first' });
            return;
        }
        
        // Remove from any existing queue
        this.removeFromQueue(socket);
        
        // Add to appropriate league queue
        const queueEntry = {
            socketId: socket.id,
            userId: userId,
            userData: user,
            leagueId: leagueId || user.current_league,
            joinedAt: Date.now()
        };
        
        this.queues[queueEntry.leagueId].push(queueEntry);
        socket.join(`queue_${queueEntry.leagueId}`);
        socket.queueData = queueEntry;
        
        socket.emit('matchmaking:joined', {
            position: this.queues[queueEntry.leagueId].length,
            leagueId: queueEntry.leagueId
        });
        
        console.log(`Player ${user.username} joined queue for league ${queueEntry.leagueId}`);
    }
    
    removeFromQueue(socket) {
        if (socket.queueData) {
            const { odataatId, leagueId } = socket.queueData;
            this.queues[leagueId] = this.queues[leagueId].filter(q => q.odataatId !== odataatId);
            socket.leave(`queue_${leagueId}`);
            delete socket.queueData;
        }
    }
    
    processQueues() {
        for (const leagueId in this.queues) {
            const queue = this.queues[leagueId];
            
            while (queue.length >= 2) {
                const player1 = queue.shift();
                const player2 = queue.shift();
                
                this.createMatch(player1, player2, parseInt(leagueId));
            }
            
            // Notify remaining players of queue position
            queue.forEach((entry, index) => {
                const socket = this.findSocketByUserId(entry.userId);
                if (socket) {
                    socket.emit('matchmaking:update', {
                        position: index + 1,
                        queueSize: queue.length
                    });
                }
            });
        }
    }
    
    findSocketByUserId(userId) {
        for (const [id, socket] of this.io.sockets.sockets) {
            if (socket.queueData && socket.queueData.userId === userId) {
                return socket;
            }
        }
        return null;
    }
    
    createMatch(player1, player2, leagueId) {
        const raceId = `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`Match created: ${player1.userData.username} vs ${player2.userData.username} in League ${leagueId}`);
        
        // Notify both players
        const socket1 = this.findSocketByUserId(player1.userId);
        const socket2 = this.findSocketByUserId(player2.userId);
        
        const matchData = {
            raceId,
            leagueId,
            player1: {
                id: player1.userId,
                username: player1.userData.username
            },
            player2: {
                id: player2.userId,
                username: player2.userData.username
            },
            track: this.selectRandomTrack()
        };
        
        if (socket1) {
            socket1.leave(`queue_${leagueId}`);
            delete socket1.queueData;
            socket1.emit('matchmaking:found', matchData);
        }
        
        if (socket2) {
            socket2.leave(`queue_${leagueId}`);
            delete socket2.queueData;
            socket2.emit('matchmaking:found', matchData);
        }
        
        // Initialize race in RaceService
        this.io.emit('race:created', matchData);
    }
    
    selectRandomTrack() {
        const tracks = [
            { id: 'monaco', name: 'Monaco', laps: 5, difficulty: 'hard' },
            { id: 'silverstone', name: 'Silverstone', laps: 5, difficulty: 'medium' },
            { id: 'spa', name: 'Spa-Francorchamps', laps: 5, difficulty: 'medium' },
            { id: 'monza', name: 'Monza', laps: 5, difficulty: 'easy' },
            { id: 'suzuka', name: 'Suzuka', laps: 5, difficulty: 'hard' }
        ];
        
        return tracks[Math.floor(Math.random() * tracks.length)];
    }
}

module.exports = MatchmakingService;