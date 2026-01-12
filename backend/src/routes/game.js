const express = require('express');
const { db } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get user's garage (pilots + car parts)
router.get('/garage', (req, res) => {
    try {
        // Get user's pilots with full data
        const pilots = db.prepare(`
            SELECT 
                up.id as user_pilot_id,
                up.level,
                up.experience,
                up.speed_bonus,
                up.cornering_bonus,
                up.overtaking_bonus,
                up.is_active_slot_1,
                up.is_active_slot_2,
                p.*
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ?
        `).all(req.userId);
        
        // Get user's car parts with full data
        const carParts = db.prepare(`
            SELECT 
                ucp.id as user_part_id,
                ucp.level,
                ucp.is_equipped,
                cp.*
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.user_id = ?
        `).all(req.userId);
        
        res.json({
            pilots,
            carParts
        });
        
    } catch (error) {
        console.error('Garage error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Set active pilots
router.post('/pilots/set-active', (req, res) => {
    try {
        const { slot1PilotId, slot2PilotId } = req.body;
        
        if (!slot1PilotId || !slot2PilotId) {
            return res.status(400).json({ error: 'Both pilot slots must be filled' });
        }
        
        if (slot1PilotId === slot2PilotId) {
            return res.status(400).json({ error: 'Cannot select the same pilot for both slots' });
        }
        
        // Reset all active slots for user
        db.prepare(`
            UPDATE user_pilots 
            SET is_active_slot_1 = 0, is_active_slot_2 = 0 
            WHERE user_id = ?
        `).run(req.userId);
        
        // Set slot 1
        db.prepare(`
            UPDATE user_pilots 
            SET is_active_slot_1 = 1 
            WHERE id = ? AND user_id = ?
        `).run(slot1PilotId, req.userId);
        
        // Set slot 2
        db.prepare(`
            UPDATE user_pilots 
            SET is_active_slot_2 = 1 
            WHERE id = ? AND user_id = ?
        `).run(slot2PilotId, req.userId);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Set active pilots error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Equip car part
router.post('/car-parts/equip', (req, res) => {
    try {
        const { partId } = req.body;
        
        // Get the part type
        const userPart = db.prepare(`
            SELECT ucp.*, cp.part_type
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.id = ? AND ucp.user_id = ?
        `).get(partId, req.userId);
        
        if (!userPart) {
            return res.status(404).json({ error: 'Part not found' });
        }
        
        // Unequip current part of same type
        db.prepare(`
            UPDATE user_car_parts 
            SET is_equipped = 0 
            WHERE user_id = ? AND part_id IN (
                SELECT id FROM car_parts WHERE part_type = ?
            )
        `).run(req.userId, userPart.part_type);
        
        // Equip new part
        db.prepare(`
            UPDATE user_car_parts 
            SET is_equipped = 1 
            WHERE id = ? AND user_id = ?
        `).run(partId, req.userId);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Equip part error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get leagues
router.get('/leagues', (req, res) => {
    try {
        const leagues = db.prepare('SELECT * FROM leagues ORDER BY id').all();
        const user = db.prepare('SELECT current_league, league_points FROM users WHERE id = ?').get(req.userId);
        
        res.json({
            leagues,
            currentLeague: user.current_league,
            leaguePoints: user.league_points
        });
        
    } catch (error) {
        console.error('Leagues error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile/stats
router.get('/profile', (req, res) => {
    try {
        const user = db.prepare(`
            SELECT id, username, email, current_league, league_points, total_wins, total_races, coins, gems
            FROM users WHERE id = ?
        `).get(req.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ user });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;