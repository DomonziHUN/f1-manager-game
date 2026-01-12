require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// Database
const { initialize: initDB } = require('./config/database');

// Routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const matchmakingRoutes = require('./routes/matchmaking');

// WebSocket
const SocketHandler = require('./websocket/socketHandler'); // ← ÚJ!

const app = express();
const server = http.createServer(app);

// Socket.io setup
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/matchmaking', matchmakingRoutes);

// Initialize WebSocket Handler
const socketHandler = new SocketHandler(server); // ← ÚJ!

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
});

// Store io instance for later use
app.set('io', io);
app.set('socketHandler', socketHandler); // ← ÚJ!

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║     🏎️  F1 Manager Backend Started  🏎️     ║
    ╠═══════════════════════════════════════════╣
    ║  Port: ${PORT}                               ║
    ║  HTTP API: /api/*                         ║
    ║  WebSocket: ws://localhost:${PORT}           ║
    ║  Auth: /api/auth/*                        ║
    ║  Game: /api/game/*                        ║
    ║  Matchmaking: /api/matchmaking/*          ║
    ║  Health: /health                          ║
    ╚═══════════════════════════════════════════╝
    `);
});

module.exports = { app, server, io, socketHandler };