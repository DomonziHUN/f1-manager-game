const authService = require('../services/authService');

/**
 * Middleware to verify JWT token and attach user to request
 */
const authenticate = (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        // Verify token and get user
        const user = authService.verifyToken(token);
        
        // Attach user to request
        req.user = user;
        req.userId = user.id;
        
        next();
    } catch (error) {
        return res.status(error.status || 401).json({
            success: false,
            message: error.message || 'Authentication failed'
        });
    }
};

/**
 * Optional auth - doesn't fail if no token, but attaches user if valid
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const user = authService.verifyToken(token);
            req.user = user;
            req.userId = user.id;
        }
    } catch (error) {
        // Ignore errors, just continue without user
    }
    
    next();
};

module.exports = {
    authenticate,
    optionalAuth
};