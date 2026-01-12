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
        
        // Give starter pilots (3 random common pilots)
        const commonPilots = db.prepare("SELECT id FROM pilots WHERE rarity = 'common' ORDER BY RANDOM() LIMIT 3").all();
        for (const pilot of commonPilots) {
            db.prepare(`
                INSERT INTO user_pilots (id, user_id, pilot_id)
                VALUES (?, ?, ?)
            `).run(uuidv4(), userId, pilot.id);
        }
        
        // Give starter car parts (1 of each type, common)
        const starterParts = db.prepare("SELECT id FROM car_parts WHERE rarity = 'common' GROUP BY part_type").all();
        for (const part of starterParts) {
            db.prepare(`
                INSERT INTO user_car_parts (id, user_id, part_id, is_equipped)
                VALUES (?, ?, ?, 1)
            `).run(uuidv4(), userId, part.id);
        }
        
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

// Verify token
router.get('/verify', require('../middleware/auth'), (req, res) => {
    const user = db.prepare('SELECT id, email, username, current_league, league_points, coins, gems FROM users WHERE id = ?').get(req.userId);
    
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user });
});

module.exports = router;