const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2) {
        return res.status(401).json({ error: 'Token error' });
    }
    
    const [scheme, token] = parts;
    
    if (!/^Bearer$/i.test(scheme)) {
        return res.status(401).json({ error: 'Token malformatted' });
    }
    
    try {
        console.log('🔍 Verifying token...'); // DEBUG
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('✅ Decoded token:', decoded); // DEBUG
        console.log('📋 User ID:', decoded.id); // DEBUG
        console.log('📧 Email:', decoded.email); // DEBUG
        
        req.userId = decoded.id;
        req.userEmail = decoded.email;
        return next();
    } catch (err) {
        console.log('❌ Token verification failed:', err.message); // DEBUG
        console.log('🔑 JWT_SECRET exists:', !!process.env.JWT_SECRET); // DEBUG
        return res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = authMiddleware;