const authService = require('../services/authService');

class AuthController {
    
    /**
     * POST /api/auth/register
     */
    async register(req, res) {
        try {
            const { email, username, password } = req.body;
            const result = await authService.register(email, username, password);
            
            res.status(201).json({
                success: true,
                message: 'Registration successful',
                data: result
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Registration failed'
            });
        }
    }
    
    /**
     * POST /api/auth/login
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);
            
            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: result
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Login failed'
            });
        }
    }
    
    /**
     * POST /api/auth/google
     */
    async googleAuth(req, res) {
        try {
            const { googleId, email, name } = req.body;
            const result = await authService.googleAuth(googleId, email, name);
            
            res.status(200).json({
                success: true,
                message: 'Google auth successful',
                data: result
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Google auth failed'
            });
        }
    }
    
    /**
     * GET /api/auth/me
     */
    async getMe(req, res) {
        try {
            // req.user is set by authMiddleware
            res.status(200).json({
                success: true,
                data: { user: req.user }
            });
        } catch (error) {
            res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Failed to get user'
            });
        }
    }
    
    /**
     * POST /api/auth/verify
     */
    async verifyToken(req, res) {
        try {
            const { token } = req.body;
            const user = authService.verifyToken(token);
            
            res.status(200).json({
                success: true,
                valid: true,
                data: { user }
            });
        } catch (error) {
            res.status(200).json({
                success: true,
                valid: false,
                message: error.message
            });
        }
    }
}

module.exports = new AuthController();