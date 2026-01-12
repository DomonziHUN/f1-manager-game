const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// Get race history
router.get('/history', (req, res) => {
    const { db } = require('../config/database');
    
    try {
        const races = db.prepare(`
            SELECT 
                rh.*,
                u1.username as player1_name,
                u2.username as player2_name
            FROM race_history rh
            LEFT JOIN users u1 ON rh.player1_id = u1.id
            LEFT JOIN users u2 ON rh.player2_id = u2.id
            WHERE rh.player1_id = ? OR rh.player2_id = ?
            ORDER BY rh.created_at DESC
            LIMIT 20
        `).all(req.userId, req.userId);
        
        res.json({ races });
        
    } catch (error) {
        console.error('Race history error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;