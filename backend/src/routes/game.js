const express = require('express');
const { db } = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All game routes require authentication
router.use(authMiddleware);

// ==========================================
// GARAGE - Garázs adatok
// ==========================================
router.get('/garage', (req, res) => {
    try {
        const userId = req.userId;
        
        // User basic info
        const user = db.prepare(`
            SELECT id, username, current_league, league_points, coins, gems, total_wins, total_races
            FROM users WHERE id = ?
        `).get(userId);
        
        // All user pilots with stats
        const pilots = db.prepare(`
            SELECT 
                up.*,
                p.name, p.team, p.nationality, p.rarity,
                p.base_speed, p.base_cornering, p.base_overtaking,
                p.base_consistency, p.base_tire_management, p.base_wet_skill,
                p.base_defense, p.base_aggression,
                -- Calculate total stats with bonuses
                (p.base_speed + up.speed_bonus) as total_speed,
                (p.base_cornering + up.cornering_bonus) as total_cornering,
                (p.base_overtaking + up.overtaking_bonus) as total_overtaking,
                (p.base_consistency + up.consistency_bonus) as total_consistency,
                (p.base_tire_management + up.tire_management_bonus) as total_tire_management
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ?
            ORDER BY up.is_active_slot_1 DESC, up.is_active_slot_2 DESC, p.rarity DESC
        `).all(userId);
        
        // Car parts with equipped status
        const carParts = db.prepare(`
            SELECT 
                ucp.*,
                cp.name, cp.part_type, cp.rarity,
                cp.speed_bonus, cp.acceleration_bonus, cp.downforce_bonus,
                cp.reliability_bonus, cp.pit_stop_bonus, cp.tire_wear_reduction,
                cp.ers_efficiency_bonus
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.user_id = ?
            ORDER BY cp.part_type, cp.rarity DESC
        `).all(userId);
        
        // Calculate total car stats
        const equippedParts = carParts.filter(part => part.is_equipped);
        const carStats = {
            speed: equippedParts.reduce((sum, part) => sum + part.speed_bonus, 0),
            acceleration: equippedParts.reduce((sum, part) => sum + part.acceleration_bonus, 0),
            downforce: equippedParts.reduce((sum, part) => sum + part.downforce_bonus, 0),
            reliability: equippedParts.reduce((sum, part) => sum + part.reliability_bonus, 0),
            pit_stop_speed: equippedParts.reduce((sum, part) => sum + part.pit_stop_bonus, 0),
            tire_wear_reduction: equippedParts.reduce((sum, part) => sum + part.tire_wear_reduction, 0),
            ers_efficiency: equippedParts.reduce((sum, part) => sum + part.ers_efficiency_bonus, 0)
        };
        
        // League info
        const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(user.current_league);
        
        res.json({
            success: true,
            data: {
                user,
                pilots,
                carParts,
                carStats,
                league
            }
        });
        
    } catch (error) {
        console.error('Garage error:', error);
        res.status(500).json({ error: 'Failed to load garage data' });
    }
});

// ==========================================
// PILOTS - Pilóta kezelés
// ==========================================

// Get all available pilots (for shop)
router.get('/pilots/available', (req, res) => {
    try {
        const userId = req.userId;
        
        // Get pilots user doesn't own yet
        const availablePilots = db.prepare(`
            SELECT p.*, 
                CASE p.rarity
                    WHEN 'common' THEN 1000
                    WHEN 'rare' THEN 5000
                    WHEN 'epic' THEN 15000
                    WHEN 'legendary' THEN 50000
                END as price_coins,
                CASE p.rarity
                    WHEN 'common' THEN 0
                    WHEN 'rare' THEN 10
                    WHEN 'epic' THEN 50
                    WHEN 'legendary' THEN 200
                END as price_gems
            FROM pilots p
            WHERE p.id NOT IN (
                SELECT pilot_id FROM user_pilots WHERE user_id = ?
            )
            ORDER BY 
                CASE p.rarity
                    WHEN 'legendary' THEN 1
                    WHEN 'epic' THEN 2
                    WHEN 'rare' THEN 3
                    WHEN 'common' THEN 4
                END,
                p.name
        `).all(userId);
        
        res.json({
            success: true,
            data: availablePilots
        });
        
    } catch (error) {
        console.error('Available pilots error:', error);
        res.status(500).json({ error: 'Failed to load available pilots' });
    }
});

// Activate pilot (set as active in slot 1 or 2)
router.post('/pilots/activate', (req, res) => {
    try {
        const userId = req.userId;
        const { pilotId, slot } = req.body; // slot: 1 or 2
        
        if (!pilotId || (slot !== 1 && slot !== 2)) {
            return res.status(400).json({ error: 'Pilot ID and valid slot (1 or 2) required' });
        }
        
        // Check if user owns this pilot
        const userPilot = db.prepare(`
            SELECT * FROM user_pilots WHERE user_id = ? AND pilot_id = ?
        `).get(userId, pilotId);
        
        if (!userPilot) {
            return res.status(404).json({ error: 'Pilot not found in your collection' });
        }
        
        // Deactivate all pilots in this slot
        if (slot === 1) {
            db.prepare(`
                UPDATE user_pilots SET is_active_slot_1 = 0 WHERE user_id = ?
            `).run(userId);
        } else {
            db.prepare(`
                UPDATE user_pilots SET is_active_slot_2 = 0 WHERE user_id = ?
            `).run(userId);
        }
        
        // Activate selected pilot
        if (slot === 1) {
            db.prepare(`
                UPDATE user_pilots SET is_active_slot_1 = 1 WHERE user_id = ? AND pilot_id = ?
            `).run(userId, pilotId);
        } else {
            db.prepare(`
                UPDATE user_pilots SET is_active_slot_2 = 1 WHERE user_id = ? AND pilot_id = ?
            `).run(userId, pilotId);
        }
        
        res.json({
            success: true,
            message: `Pilot activated in slot ${slot}`
        });
        
    } catch (error) {
        console.error('Activate pilot error:', error);
        res.status(500).json({ error: 'Failed to activate pilot' });
    }
});

// Buy pilot
router.post('/pilots/buy', (req, res) => {
    try {
        const userId = req.userId;
        const { pilotId, paymentType } = req.body; // paymentType: 'coins' or 'gems'
        
        if (!pilotId || !paymentType) {
            return res.status(400).json({ error: 'Pilot ID and payment type required' });
        }
        
        // Check if pilot exists and user doesn't own it
        const pilot = db.prepare('SELECT * FROM pilots WHERE id = ?').get(pilotId);
        if (!pilot) {
            return res.status(404).json({ error: 'Pilot not found' });
        }
        
        const existingUserPilot = db.prepare(`
            SELECT * FROM user_pilots WHERE user_id = ? AND pilot_id = ?
        `).get(userId, pilotId);
        
        if (existingUserPilot) {
            return res.status(400).json({ error: 'You already own this pilot' });
        }
        
        // Calculate price
        const prices = {
            common: { coins: 1000, gems: 0 },
            rare: { coins: 5000, gems: 10 },
            epic: { coins: 15000, gems: 50 },
            legendary: { coins: 50000, gems: 200 }
        };
        
        const price = prices[pilot.rarity];
        if (!price) {
            return res.status(400).json({ error: 'Invalid pilot rarity' });
        }
        
        // Get user's current currency
        const user = db.prepare('SELECT coins, gems FROM users WHERE id = ?').get(userId);
        
        // Check if user has enough currency
        if (paymentType === 'coins') {
            if (user.coins < price.coins) {
                return res.status(400).json({ error: 'Not enough coins' });
            }
        } else if (paymentType === 'gems') {
            if (user.gems < price.gems) {
                return res.status(400).json({ error: 'Not enough gems' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid payment type' });
        }
        
        // Process purchase
        const { v4: uuidv4 } = require('uuid');
        
        // Deduct currency
        if (paymentType === 'coins') {
            db.prepare(`
                UPDATE users SET coins = coins - ? WHERE id = ?
            `).run(price.coins, userId);
        } else {
            db.prepare(`
                UPDATE users SET gems = gems - ? WHERE id = ?
            `).run(price.gems, userId);
        }
        
        // Add pilot to user's collection
        db.prepare(`
            INSERT INTO user_pilots (id, user_id, pilot_id)
            VALUES (?, ?, ?)
        `).run(uuidv4(), userId, pilotId);
        
        res.json({
            success: true,
            message: 'Pilot purchased successfully',
            spent: paymentType === 'coins' ? price.coins : price.gems,
            currency: paymentType
        });
        
    } catch (error) {
        console.error('Buy pilot error:', error);
        res.status(500).json({ error: 'Failed to purchase pilot' });
    }
});

// ==========================================
// CAR PARTS - Autó alkatrész kezelés
// ==========================================

// Equip car part
router.post('/car/equip', (req, res) => {
    try {
        const userId = req.userId;
        const { partId } = req.body;
        
        if (!partId) {
            return res.status(400).json({ error: 'Part ID required' });
        }
        
        // Check if user owns this part
        const userPart = db.prepare(`
            SELECT ucp.*, cp.part_type 
            FROM user_car_parts ucp
            JOIN car_parts cp ON ucp.part_id = cp.id
            WHERE ucp.user_id = ? AND ucp.part_id = ?
        `).get(userId, partId);
        
        if (!userPart) {
            return res.status(404).json({ error: 'Part not found in your collection' });
        }
        
        // Unequip all parts of the same type
        db.prepare(`
            UPDATE user_car_parts 
            SET is_equipped = 0 
            WHERE user_id = ? AND part_id IN (
                SELECT cp.id FROM car_parts cp WHERE cp.part_type = ?
            )
        `).run(userId, userPart.part_type);
        
        // Equip selected part
        db.prepare(`
            UPDATE user_car_parts SET is_equipped = 1 
            WHERE user_id = ? AND part_id = ?
        `).run(userId, partId);
        
        res.json({
            success: true,
            message: 'Part equipped successfully'
        });
        
    } catch (error) {
        console.error('Equip part error:', error);
        res.status(500).json({ error: 'Failed to equip part' });
    }
});

// ==========================================
// LEAGUES - Liga információk
// ==========================================
router.get('/leagues', (req, res) => {
    try {
        const userId = req.userId;
        
        // Get all leagues
        const leagues = db.prepare('SELECT * FROM leagues ORDER BY id').all();
        
        // Get user's current league and points
        const user = db.prepare(`
            SELECT current_league, league_points, highest_league 
            FROM users WHERE id = ?
        `).get(userId);
        
        // Add user's status to each league
        const leaguesWithStatus = leagues.map(league => ({
            ...league,
            isCurrentLeague: league.id === user.current_league,
            isUnlocked: league.id <= user.highest_league,
            userPoints: user.league_points
        }));
        
        res.json({
            success: true,
            data: {
                leagues: leaguesWithStatus,
                currentLeague: user.current_league,
                currentPoints: user.league_points
            }
        });
        
    } catch (error) {
        console.error('Leagues error:', error);
        res.status(500).json({ error: 'Failed to load leagues' });
    }
});

module.exports = router;