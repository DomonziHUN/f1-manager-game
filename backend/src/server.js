require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');

// Database
const { initialize: initDB } = require('./config/database');

// Routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const matchmakingRoutes = require('./routes/matchmaking');

// Native WebSocket (instead of Socket.IO)
const NativeSocketHandler = require('./websocket/nativeSocketHandler');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/matchmaking', matchmakingRoutes);

// Initialize Native WebSocket Handler
const socketHandler = new NativeSocketHandler(server);

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

// Store socketHandler for later use
app.set('socketHandler', socketHandler);

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

module.exports = { app, server, socketHandler };