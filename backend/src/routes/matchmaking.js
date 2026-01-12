const express = require('express');
const { db } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// All matchmaking routes require authentication
router.use(authMiddleware);

// ==========================================
// MATCHMAKING QUEUE
// ==========================================

// Join matchmaking queue
router.post('/queue/join', (req, res) => {
    try {
        const userId = req.userId;
        
        // Get user's active pilots
        const activePilots = db.prepare(`
            SELECT pilot_id FROM user_pilots 
            WHERE user_id = ? AND (is_active_slot_1 = 1 OR is_active_slot_2 = 1)
        `).all(userId);
        
        if (activePilots.length < 2) {
            return res.status(400).json({ 
                error: 'You need 2 active pilots to join matchmaking' 
            });
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
            return res.status(400).json({ 
                error: 'Already in matchmaking queue' 
            });
        }
        
        // Add to queue
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
        
        console.log(`🎮 User ${userId} joined matchmaking queue`);
        
        res.json({
            success: true,
            message: 'Joined matchmaking queue',
            queueId: queueId,
            estimatedWaitTime: '30-60 seconds'
        });
        
    } catch (error) {
        console.error('Join queue error:', error);
        res.status(500).json({ error: 'Failed to join matchmaking' });
    }
});

// Leave matchmaking queue
router.post('/queue/leave', (req, res) => {
    try {
        const userId = req.userId;
        
        const result = db.prepare(`
            DELETE FROM matchmaking_queue WHERE user_id = ?
        `).run(userId);
        
        if (result.changes === 0) {
            return res.status(400).json({ 
                error: 'Not in matchmaking queue' 
            });
        }
        
        console.log(`🚪 User ${userId} left matchmaking queue`);
        
        res.json({
            success: true,
            message: 'Left matchmaking queue'
        });
        
    } catch (error) {
        console.error('Leave queue error:', error);
        res.status(500).json({ error: 'Failed to leave matchmaking' });
    }
});

// Check queue status
router.get('/queue/status', (req, res) => {
    try {
        const userId = req.userId;
        
        const queueEntry = db.prepare(`
            SELECT * FROM matchmaking_queue WHERE user_id = ?
        `).get(userId);
        
        if (!queueEntry) {
            return res.json({
                success: true,
                inQueue: false
            });
        }
        
        // Count players in same league
        const queueCount = db.prepare(`
            SELECT COUNT(*) as count FROM matchmaking_queue 
            WHERE league_id = ? AND status = 'waiting'
        `).get(queueEntry.league_id);
        
        res.json({
            success: true,
            inQueue: true,
            queueId: queueEntry.id,
            league: queueEntry.league_id,
            queuedAt: queueEntry.queued_at,
            playersInQueue: queueCount.count,
            status: queueEntry.status
        });
        
    } catch (error) {
        console.error('Queue status error:', error);
        res.status(500).json({ error: 'Failed to get queue status' });
    }
});

// ==========================================
// MATCH CREATION (Simplified for now)
// ==========================================

// Find match (for testing - normally this would be automatic)
router.post('/find-match', (req, res) => {
    try {
        const userId = req.userId;
        
        // Get user's queue entry
        const userQueue = db.prepare(`
            SELECT * FROM matchmaking_queue WHERE user_id = ? AND status = 'waiting'
        `).get(userId);
        
        if (!userQueue) {
            return res.status(400).json({ 
                error: 'Not in matchmaking queue' 
            });
        }
        
        // Find opponent in same league
        const opponent = db.prepare(`
            SELECT * FROM matchmaking_queue 
            WHERE league_id = ? AND user_id != ? AND status = 'waiting'
            ORDER BY queued_at ASC
            LIMIT 1
        `).get(userQueue.league_id, userId);
        
        if (!opponent) {
            return res.json({
                success: true,
                matchFound: false,
                message: 'No opponents found, waiting...'
            });
        }
        
        // Create match
        const matchId = uuidv4();
        
        // Get random track for this league
        const track = db.prepare(`
            SELECT * FROM tracks 
            WHERE unlock_league <= ? 
            ORDER BY RANDOM() 
            LIMIT 1
        `).get(userQueue.league_id);
        
        // Create active match
        db.prepare(`
            INSERT INTO active_matches (
                id, player1_id, player2_id, league_id, track_id, status
            ) VALUES (?, ?, ?, ?, ?, 'preparing')
        `).run(matchId, userId, opponent.user_id, userQueue.league_id, track.id);
        
        // Remove both players from queue
        db.prepare(`
            DELETE FROM matchmaking_queue WHERE user_id IN (?, ?)
        `).run(userId, opponent.user_id);
        
        console.log(`🏁 Match created: ${userId} vs ${opponent.user_id} on ${track.name}`);
        
        res.json({
            success: true,
            matchFound: true,
            matchId: matchId,
            opponent: {
                id: opponent.user_id,
                league: opponent.league_id,
                rating: opponent.rating
            },
            track: {
                id: track.id,
                name: track.name,
                country: track.country,
                laps: track.total_laps
            }
        });
        
    } catch (error) {
        console.error('Find match error:', error);
        res.status(500).json({ error: 'Failed to find match' });
    }
});
// Get active match
router.get('/match/current', (req, res) => {
    try {
        const userId = req.userId;
        
        const match = db.prepare(`
            SELECT 
                am.*,
                t.name as track_name, t.country, t.total_laps, t.track_length_km
            FROM active_matches am
            JOIN tracks t ON am.track_id = t.id
            WHERE (am.player1_id = ? OR am.player2_id = ?) 
            AND am.status != 'finished'
        `).get(userId, userId);
        
        if (!match) {
            return res.json({
                success: true,
                hasActiveMatch: false
            });
        }
        
        // Get opponent info
        const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
        const opponent = db.prepare(`
            SELECT username, current_league, league_points FROM users WHERE id = ?
        `).get(opponentId);
        
        res.json({
            success: true,
            hasActiveMatch: true,
            match: {
                id: match.id,
                status: match.status,
                currentLap: match.current_lap,
                track: {
                    name: match.track_name,
                    country: match.country,
                    laps: match.total_laps,
                    length: match.track_length_km
                },
                opponent: {
                    username: opponent.username,
                    league: opponent.current_league,
                    points: opponent.league_points
                }
            }
        });
        
    } catch (error) {
        console.error('Get current match error:', error);
        res.status(500).json({ error: 'Failed to get current match' });
    }
});
module.exports = router;