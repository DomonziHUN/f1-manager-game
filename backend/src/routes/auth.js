const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/database');

const router = express.Router();

// Register with email/password
router.post('/register', async (req, res) => {
    try {
        const { email, username, password } = req.body;
        
        if (!email || !username || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        // Check if user exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
        if (existingUser) {
            return res.status(400).json({ error: 'Email or username already exists' });
        }
        
        // Hash password
        const password_hash = await bcrypt.hash(password, 10);
        
        // Create user
        const userId = uuidv4();
        db.prepare(`
            INSERT INTO users (id, email, username, password_hash)
            VALUES (?, ?, ?, ?)
        `).run(userId, email, username, password_hash);
        
        // Give starter pack using the database function
        const { giveStarterPack } = require('../config/database');
        giveStarterPack(userId);
        
        // Generate token
        const token = jwt.sign(
            { id: userId, email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            message: 'User created successfully',
            token,
            user: {
                id: userId,
                email,
                username
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login with email/password
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                current_league: user.current_league,
                league_points: user.league_points,
                coins: user.coins,
                gems: user.gems
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get current user info with detailed data
router.get('/me', require('../middleware/auth'), (req, res) => {
    try {
        const user = db.prepare(`
            SELECT 
                id, email, username, google_id,
                current_league, league_points, season_points,
                total_wins, total_races, coins, gems,
                win_streak, highest_league,
                created_at, updated_at
            FROM users WHERE id = ?
        `).get(req.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get active pilots
        const activePilots = db.prepare(`
            SELECT 
                up.*,
                p.name, p.team, p.nationality, p.rarity,
                p.base_speed, p.base_cornering, p.base_overtaking,
                p.base_consistency, p.base_tire_management, p.base_wet_skill,
                p.base_defense, p.base_aggression
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ? AND (up.is_active_slot_1 = 1 OR up.is_active_slot_2 = 1)
        `).all(req.userId);
        
        // Get league info
        const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(user.current_league);
        
        res.json({
            success: true,
            user: {
                ...user,
                activePilots,
                league
            }
        });
        
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Verify token
router.get('/verify', require('../middleware/auth'), (req, res) => {
    const user = db.prepare('SELECT id, email, username, current_league, league_points, coins, gems FROM users WHERE id = ?').get(req.userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
});
// Get current user info
router.get('/me', require('../middleware/auth'), (req, res) => {
    try {
        const user = db.prepare(`
            SELECT 
                id, email, username, google_id,
                current_league, league_points, season_points,
                total_wins, total_races, coins, gems,
                win_streak, highest_league,
                created_at, updated_at
            FROM users WHERE id = ?
        `).get(req.userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Get active pilots
        const activePilots = db.prepare(`
            SELECT 
                up.*,
                p.name, p.team, p.nationality, p.rarity,
                p.base_speed, p.base_cornering, p.base_overtaking,
                p.base_consistency, p.base_tire_management, p.base_wet_skill,
                p.base_defense, p.base_aggression
            FROM user_pilots up
            JOIN pilots p ON up.pilot_id = p.id
            WHERE up.user_id = ? AND (up.is_active_slot_1 = 1 OR up.is_active_slot_2 = 1)
        `).all(req.userId);
        
        // Get league info
        const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(user.current_league);
        
        res.json({
            success: true,
            user: {
                ...user,
                activePilots,
                league
            }
        });
        
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;