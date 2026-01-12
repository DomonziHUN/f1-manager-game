const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db, giveStarterPack } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const JWT_EXPIRES_IN = '7d';

class AuthService {
    
    /**
     * Register new user with email/password
     */
    async register(email, username, password) {
        // Validate input
        if (!email || !username || !password) {
            throw { status: 400, message: 'Email, username and password required' };
        }
        
        if (password.length < 6) {
            throw { status: 400, message: 'Password must be at least 6 characters' };
        }
        
        if (username.length < 3 || username.length > 20) {
            throw { status: 400, message: 'Username must be 3-20 characters' };
        }
        
        // Check if email already exists
        const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existingEmail) {
            throw { status: 409, message: 'Email already registered' };
        }
        
        // Check if username already exists
        const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existingUsername) {
            throw { status: 409, message: 'Username already taken' };
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Create user
        const userId = uuidv4();
        
        db.prepare(`
            INSERT INTO users (id, email, username, password_hash)
            VALUES (?, ?, ?, ?)
        `).run(userId, email.toLowerCase(), username, passwordHash);
        
        // Give starter pack (2 pilots + basic car parts)
        giveStarterPack(userId);
        
        // Generate token
        const token = this.generateToken(userId);
        
        // Get user data
        const user = this.getUserById(userId);
        
        return { user, token };
    }
    
    /**
     * Login with email/password
     */
    async login(email, password) {
        if (!email || !password) {
            throw { status: 400, message: 'Email and password required' };
        }
        
        // Find user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
        
        if (!user) {
            throw { status: 401, message: 'Invalid credentials' };
        }
        
        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            throw { status: 401, message: 'Invalid credentials' };
        }
        
        // Update last login
        db.prepare(`
            UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(user.id);
        
        // Generate token
        const token = this.generateToken(user.id);
        
        // Get clean user data
        const userData = this.getUserById(user.id);
        
        return { user: userData, token };
    }
    
    /**
     * Login/Register with Google OAuth
     */
    async googleAuth(googleId, email, name) {
        if (!googleId || !email) {
            throw { status: 400, message: 'Google ID and email required' };
        }
        
        // Check if user exists with this Google ID
        let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
        
        if (!user) {
            // Check if email exists (link accounts)
            user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
            
            if (user) {
                // Link Google ID to existing account
                db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, user.id);
            } else {
                // Create new user
                const userId = uuidv4();
                const username = this.generateUniqueUsername(name || email.split('@')[0]);
                
                db.prepare(`
                    INSERT INTO users (id, email, username, google_id)
                    VALUES (?, ?, ?, ?)
                `).run(userId, email.toLowerCase(), username, googleId);
                
                // Give starter pack
                giveStarterPack(userId);
                
                user = { id: userId };
            }
        }
        
        // Update last login
        db.prepare(`
            UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(user.id);
        
        // Generate token
        const token = this.generateToken(user.id);
        
        // Get clean user data
        const userData = this.getUserById(user.id);
        
        return { user: userData, token };
    }
    
    /**
     * Verify JWT token and return user
     */
    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = this.getUserById(decoded.userId);
            
            if (!user) {
                throw { status: 401, message: 'User not found' };
            }
            
            return user;
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw { status: 401, message: 'Token expired' };
            }
            throw { status: 401, message: 'Invalid token' };
        }
    }
    
    /**
     * Get user by ID (clean data, no password)
     */
    getUserById(userId) {
        const user = db.prepare(`
            SELECT 
                id, email, username, google_id,
                current_league, league_points, season_points,
                total_wins, total_races, coins, gems,
                win_streak, highest_league,
                created_at, updated_at
            FROM users WHERE id = ?
        `).get(userId);
        
        if (!user) return null;
        
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
        `).all(userId);
        
        // Get league info
        const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(user.current_league);
        
        return {
            ...user,
            activePilots,
            league
        };
    }
    
    /**
     * Generate JWT token
     */
    generateToken(userId) {
        return jwt.sign(
            { userId },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
    }
    
    /**
     * Generate unique username from name
     */
    generateUniqueUsername(baseName) {
        let username = baseName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 15);
        let counter = 0;
        
        while (true) {
            const testName = counter === 0 ? username : `${username}${counter}`;
            const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(testName);
            
            if (!exists) {
                return testName;
            }
            counter++;
        }
    }
}

module.exports = new AuthService();