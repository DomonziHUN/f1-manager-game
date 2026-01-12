require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/game');
const raceRoutes = require('./routes/race');

// Services
const MatchmakingService = require('./services/MatchmakingService');
const RaceService = require('./services/RaceService');

// Database
const db = require('./config/database');

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const matchmakingService = new MatchmakingService(io);
const raceService = new RaceService(io);

// Make services available to routes
app.set('matchmakingService', matchmakingService);
app.set('raceService', raceService);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/race', raceRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Matchmaking events
    socket.on('matchmaking:join', (data) => {
        matchmakingService.addToQueue(socket, data);
    });
    
    socket.on('matchmaking:leave', () => {
        matchmakingService.removeFromQueue(socket);
    });
    
    // Race events
    socket.on('race:join', (data) => {
        raceService.joinRace(socket, data);
    });
    
    socket.on('race:command', (data) => {
        raceService.handleCommand(socket, data);
    });
    
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        matchmakingService.removeFromQueue(socket);
        raceService.handleDisconnect(socket);
    });
});

// Initialize database and start server
db.initialize();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════╗
║     F1 Manager Game Server Started!       ║
╠═══════════════════════════════════════════╣
║  REST API: http://localhost:${PORT}/api     ║
║  WebSocket: ws://localhost:${PORT}          ║
╚═══════════════════════════════════════════╝
    `);
});