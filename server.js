// GoKarts Multiplayer Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, '.')));

// Game state
const gameRooms = new Map();
const players = new Map();
const globalLeaderboard = [];

// Load existing leaderboard from file if it exists
const fs = require('fs');
const leaderboardFile = 'leaderboard.json';

function loadLeaderboard() {
    try {
        if (fs.existsSync(leaderboardFile)) {
            const data = fs.readFileSync(leaderboardFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('Error loading leaderboard:', error);
    }
    return [];
}

function saveLeaderboard() {
    try {
        fs.writeFileSync(leaderboardFile, JSON.stringify(globalLeaderboard, null, 2));
    } catch (error) {
        console.log('Error saving leaderboard:', error);
    }
}

// Initialize leaderboard
globalLeaderboard.push(...loadLeaderboard());

class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.bots = [];
        this.maxPlayers = 5;
        this.state = 'waiting'; // waiting, racing, finished
        this.raceStartTime = null;
        this.raceUpdateInterval = null;
        this.raceData = {
            checkpoints: [
                { p1: { x: 0.62, y: 0.76 }, p2: { x: 0.69, y: 0.91 } },  // CP1
                { p1: { x: 0.41, y: 0.93 }, p2: { x: 0.44, y: 0.79 } },  // CP2
                { p1: { x: 0.15, y: 0.76 }, p2: { x: 0.24, y: 0.66 } },  // CP3
                { p1: { x: 0.06, y: 0.37 }, p2: { x: 0.17, y: 0.39 } },  // CP4
                { p1: { x: 0.26, y: 0.11 }, p2: { x: 0.27, y: 0.24 } },  // CP5
                { p1: { x: 0.33, y: 0.32 }, p2: { x: 0.44, y: 0.34 } },  // CP6
                { p1: { x: 0.43, y: 0.51 }, p2: { x: 0.34, y: 0.63 } },  // CP7
                { p1: { x: 0.53, y: 0.48 }, p2: { x: 0.62, y: 0.57 } },  // CP8
                { p1: { x: 0.59, y: 0.20 }, p2: { x: 0.67, y: 0.32 } },  // CP9
                { p1: { x: 0.76, y: 0.28 }, p2: { x: 0.84, y: 0.14 } }   // CP10
            ],
            startFinishLine: { p1: { x: 0.763, y: 0.463 }, p2: { x: 0.862, y: 0.572 } }
        };
    }

    addPlayer(player) {
        if (this.players.length < this.maxPlayers && this.state === 'waiting') {
            this.players.push(player);
            player.room = this.id;
            return true;
        }
        return false;
    }

    removePlayer(playerId) {
        this.players = this.players.filter(p => p.id !== playerId);
        if (this.players.length === 0) {
            this.cleanup();
            gameRooms.delete(this.id);
        }
    }

    createBots() {
        const botNames = ['SpeedBot', 'RacerAI', 'TurboBot', 'ZoomBot', 'FlashBot'];
        const botsNeeded = Math.min(this.maxPlayers - this.players.length, 4); // Max 4 bots
        
        for (let i = 0; i < botsNeeded; i++) {
            const botId = `bot_${this.id}_${i}`;
            const bot = {
                id: botId,
                name: botNames[i] || `Bot${i + 1}`,
                isBot: true,
                position: {
                    x: 0.80, // Start position X
                    y: 0.50, // Start position Y
                    angle: Math.atan2(0.72 - 0.80, -(0.68 - 0.50)), // Face direction
                    lapCount: 1,
                    nextCheckpoint: 0,
                    checkpointsPassed: [],
                    lapStarted: false
                },
                // Bot AI properties
                speed: 0,
                maxSpeed: 3 + Math.random() * 1.5, // Random speed variation
                acceleration: 0.25 + Math.random() * 0.1,
                aiTarget: null,
                lastUpdate: Date.now()
            };
            
            this.bots.push(bot);
        }
        
        console.log(`Created ${botsNeeded} bots for room ${this.id}`);
    }

    canStartRace() {
        return this.players.length >= 1 && this.state === 'waiting'; // Changed from 2 to 1 to allow single player with bots
    }

    startRace() {
        if (this.canStartRace()) {
            this.state = 'racing';
            this.raceStartTime = Date.now();
            
            // Create bots to fill empty slots
            this.createBots();
            
            // Initialize race positions for all players
            this.players.forEach((player, index) => {
                player.position = {
                    x: 0.80, // Start position X (normalized)
                    y: 0.50, // Start position Y (normalized)
                    angle: Math.atan2(0.72 - 0.80, -(0.68 - 0.50)), // Face direction
                    lapCount: 1,
                    nextCheckpoint: 0,
                    checkpointsPassed: [],
                    lapStarted: false
                };
            });

            // Start bot AI update loop
            this.startBotAI();

            return true;
        }
        return false;
    }

    updatePlayerPosition(playerId, positionData) {
        const player = this.players.find(p => p.id === playerId);
        if (player && this.state === 'racing') {
            player.position = { ...player.position, ...positionData };
            return true;
        }
        return false;
    }

    startBotAI() {
        // Update bot positions every 50ms (20 FPS)
        this.raceUpdateInterval = setInterval(() => {
            if (this.state === 'racing') {
                this.updateBots();
                this.broadcastBotPositions();
                this.checkBotFinish();
            }
        }, 50);
    }

    updateBots() {
        this.bots.forEach(bot => {
            // Calculate next target checkpoint
            if (!bot.aiTarget || this.distanceToPoint(bot.position, bot.aiTarget) < 0.1) {
                bot.aiTarget = this.getNextCheckpointTarget(bot);
            }

            // Move towards target
            const dx = bot.aiTarget.x - bot.position.x;
            const dy = bot.aiTarget.y - bot.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0.01) {
                // Calculate target angle
                const targetAngle = Math.atan2(dx, -dy);
                
                // Smooth angle interpolation
                let angleDiff = targetAngle - bot.position.angle;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                
                bot.position.angle += angleDiff * 0.1; // Turn speed

                // Accelerate
                bot.speed = Math.min(bot.speed + bot.acceleration, bot.maxSpeed);
                
                // Move forward
                const moveDistance = bot.speed * 0.016; // Roughly 60 FPS equivalent
                bot.position.x += Math.sin(bot.position.angle) * moveDistance;
                bot.position.y -= Math.cos(bot.position.angle) * moveDistance;

                // Keep on track (basic bounds)
                bot.position.x = Math.max(0.05, Math.min(0.95, bot.position.x));
                bot.position.y = Math.max(0.05, Math.min(0.95, bot.position.y));

                // Update checkpoint progress
                this.updateBotCheckpoints(bot);
            }
        });
    }

    getNextCheckpointTarget(bot) {
        if (bot.position.nextCheckpoint < this.raceData.checkpoints.length) {
            const checkpoint = this.raceData.checkpoints[bot.position.nextCheckpoint];
            // Target the middle of the checkpoint line
            return {
                x: (checkpoint.p1.x + checkpoint.p2.x) / 2,
                y: (checkpoint.p1.y + checkpoint.p2.y) / 2
            };
        } else {
            // Target start/finish line
            const startFinish = this.raceData.startFinishLine;
            return {
                x: (startFinish.p1.x + startFinish.p2.x) / 2,
                y: (startFinish.p1.y + startFinish.p2.y) / 2
            };
        }
    }

    updateBotCheckpoints(bot) {
        // Simple checkpoint detection - if bot is close enough to target, mark as passed
        if (bot.aiTarget) {
            const distToTarget = this.distanceToPoint(bot.position, bot.aiTarget);
            
            if (distToTarget < 0.08) { // Checkpoint passing threshold
                if (!bot.position.lapStarted) {
                    bot.position.lapStarted = true;
                    bot.position.nextCheckpoint = 0;
                } else if (bot.position.nextCheckpoint < this.raceData.checkpoints.length) {
                    bot.position.nextCheckpoint++;
                } else {
                    // Completed lap
                    bot.position.lapCount++;
                    bot.position.nextCheckpoint = 0;
                }
            }
        }
    }

    distanceToPoint(pos1, pos2) {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    broadcastBotPositions() {
        this.bots.forEach(bot => {
            io.to(this.id).emit('player-position', {
                playerId: bot.id,
                x: bot.position.x,
                y: bot.position.y,
                angle: bot.position.angle,
                lapCount: bot.position.lapCount,
                nextCheckpoint: bot.position.nextCheckpoint,
                speed: bot.speed
            });
        });
    }

    checkBotFinish() {
        this.bots.forEach(bot => {
            if (bot.position.lapCount > 3 && this.state === 'racing') {
                // Bot finished the race
                this.finishRace(bot.id);
            }
        });
    }

    cleanup() {
        if (this.raceUpdateInterval) {
            clearInterval(this.raceUpdateInterval);
            this.raceUpdateInterval = null;
        }
    }

    finishRace(winnerId) {
        if (this.state === 'racing') {
            this.state = 'finished';
            this.cleanup(); // Stop bot updates
            
            // Find winner in players or bots
            let winner = this.players.find(p => p.id === winnerId);
            if (!winner) {
                winner = this.bots.find(b => b.id === winnerId);
            }
            
            if (winner) {
                // Only update leaderboard for human players
                if (!winner.isBot) {
                    updateGlobalLeaderboard(winner.name || winner.wallet || `Player_${winnerId}`);
                }
                return winner;
            }
        }
        return null;
    }
}

function updateGlobalLeaderboard(playerName) {
    const existingPlayer = globalLeaderboard.find(p => p.name === playerName);
    if (existingPlayer) {
        existingPlayer.wins++;
        existingPlayer.lastWin = new Date().toISOString();
    } else {
        globalLeaderboard.push({
            name: playerName,
            wins: 1,
            firstWin: new Date().toISOString(),
            lastWin: new Date().toISOString()
        });
    }
    
    // Sort by wins
    globalLeaderboard.sort((a, b) => b.wins - a.wins);
    
    // Keep only top 100
    if (globalLeaderboard.length > 100) {
        globalLeaderboard.splice(100);
    }
    
    // Save to file
    saveLeaderboard();
}

function findOrCreateRoom() {
    // Find a room with space
    for (const [roomId, room] of gameRooms) {
        if (room.players.length < room.maxPlayers && room.state === 'waiting') {
            return room;
        }
    }
    
    // Create new room
    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const room = new GameRoom(roomId);
    gameRooms.set(roomId, room);
    return room;
}

// Socket.io connections
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);
    
    // Store player info
    players.set(socket.id, {
        id: socket.id,
        name: null,
        wallet: null,
        room: null,
        position: null
    });

    // Player authentication/identification
    socket.on('player-identify', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.name = data.name;
            player.wallet = data.wallet;
            console.log(`Player identified: ${data.name} (${data.wallet})`);
        }
    });

    // Matchmaking
    socket.on('find-match', () => {
        const player = players.get(socket.id);
        if (!player) return;

        const room = findOrCreateRoom();
        if (room.addPlayer(player)) {
            socket.join(room.id);
            
            // Notify room about new player
            io.to(room.id).emit('room-update', {
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name || `Player_${p.id.substr(0, 6)}`
                })),
                playersCount: room.players.length,
                maxPlayers: room.maxPlayers,
                canStart: room.canStartRace()
            });

            console.log(`Player ${socket.id} joined room ${room.id} (${room.players.length}/${room.maxPlayers})`);

            // Start race if enough players
            if (room.canStartRace()) {
                setTimeout(() => {
                    if (room.startRace()) {
                        // Combine human players and bots for race start
                        const allRacers = [
                            ...room.players.map(p => ({
                                id: p.id,
                                name: p.name || `Player_${p.id.substr(0, 6)}`,
                                position: p.position,
                                isBot: false
                            })),
                            ...room.bots.map(b => ({
                                id: b.id,
                                name: b.name,
                                position: b.position,
                                isBot: true
                            }))
                        ];

                        io.to(room.id).emit('race-start', {
                            players: allRacers,
                            startTime: room.raceStartTime
                        });
                        console.log(`Race started in room ${room.id}`);
                    }
                }, 3000); // 3 second countdown
            }
        } else {
            socket.emit('matchmaking-error', 'Could not find available room');
        }
    });

    // Game position updates
    socket.on('player-update', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;

        const room = gameRooms.get(player.room);
        if (room && room.updatePlayerPosition(socket.id, data)) {
            // Broadcast to other players in room
            socket.to(room.id).emit('player-position', {
                playerId: socket.id,
                ...data
            });
        }
    });

    // Race finish
    socket.on('race-finish', (data) => {
        const player = players.get(socket.id);
        if (!player || !player.room) return;

        const room = gameRooms.get(player.room);
        if (room) {
            const winner = room.finishRace(socket.id);
            if (winner) {
                // Combine all racers and sort by race progress for final positions
                const allRacers = [
                    ...room.players.map(p => ({
                        id: p.id,
                        name: p.name || `Player_${p.id.substr(0, 6)}`,
                        isBot: false,
                        lapCount: p.position?.lapCount || 1,
                        nextCheckpoint: p.position?.nextCheckpoint || 0
                    })),
                    ...room.bots.map(b => ({
                        id: b.id,
                        name: b.name,
                        isBot: true,
                        lapCount: b.position?.lapCount || 1,
                        nextCheckpoint: b.position?.nextCheckpoint || 0
                    }))
                ];

                // Sort by race progress (lap count, then checkpoint progress)
                allRacers.sort((a, b) => {
                    if (a.lapCount !== b.lapCount) return b.lapCount - a.lapCount;
                    return b.nextCheckpoint - a.nextCheckpoint;
                });

                io.to(room.id).emit('race-end', {
                    winner: {
                        id: winner.id,
                        name: winner.name || `Player_${winner.id.substr(0, 6)}`,
                        isBot: winner.isBot || false
                    },
                    finalPositions: allRacers.map((racer, index) => ({
                        id: racer.id,
                        name: racer.name,
                        isBot: racer.isBot,
                        position: index + 1
                    }))
                });
                
                console.log(`Race finished in room ${room.id}, winner: ${winner.name || winner.id}`);
            }
        }
    });

    // Get leaderboard
    socket.on('get-leaderboard', () => {
        socket.emit('leaderboard-data', globalLeaderboard.slice(0, 50)); // Top 50
    });

    // Leave room
    socket.on('leave-room', () => {
        const player = players.get(socket.id);
        if (player && player.room) {
            const room = gameRooms.get(player.room);
            if (room) {
                socket.leave(room.id);
                room.removePlayer(socket.id);
                
                // Notify remaining players
                io.to(room.id).emit('room-update', {
                    players: room.players.map(p => ({
                        id: p.id,
                        name: p.name || `Player_${p.id.substr(0, 6)}`
                    })),
                    playersCount: room.players.length,
                    maxPlayers: room.maxPlayers,
                    canStart: room.canStartRace()
                });
            }
            player.room = null;
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        const player = players.get(socket.id);
        if (player && player.room) {
            const room = gameRooms.get(player.room);
            if (room) {
                room.removePlayer(socket.id);
                
                // Notify remaining players
                io.to(room.id).emit('room-update', {
                    players: room.players.map(p => ({
                        id: p.id,
                        name: p.name || `Player_${p.id.substr(0, 6)}`
                    })),
                    playersCount: room.players.length,
                    maxPlayers: room.maxPlayers,
                    canStart: room.canStartRace()
                });
            }
        }
        
        players.delete(socket.id);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🏎️ GoKarts Multiplayer Server running on port ${PORT}`);
    console.log(`📊 Loaded ${globalLeaderboard.length} players from leaderboard`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    saveLeaderboard();
    process.exit(0);
});