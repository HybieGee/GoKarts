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
        this.maxPlayers = 5;
        this.state = 'waiting'; // waiting, racing, finished
        this.raceStartTime = null;
        this.raceData = {
            checkpoints: [],
            startFinishLine: null
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
            gameRooms.delete(this.id);
        }
    }

    canStartRace() {
        return this.players.length >= 2 && this.state === 'waiting';
    }

    startRace() {
        if (this.canStartRace()) {
            this.state = 'racing';
            this.raceStartTime = Date.now();
            
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

    finishRace(winnerId) {
        if (this.state === 'racing') {
            this.state = 'finished';
            const winner = this.players.find(p => p.id === winnerId);
            
            if (winner) {
                // Update global leaderboard
                updateGlobalLeaderboard(winner.name || winner.wallet || `Player_${winnerId}`);
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
                        io.to(room.id).emit('race-start', {
                            players: room.players.map(p => ({
                                id: p.id,
                                name: p.name || `Player_${p.id.substr(0, 6)}`,
                                position: p.position
                            })),
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
                io.to(room.id).emit('race-end', {
                    winner: {
                        id: winner.id,
                        name: winner.name || `Player_${winner.id.substr(0, 6)}`
                    },
                    finalPositions: room.players.map((p, index) => ({
                        id: p.id,
                        name: p.name || `Player_${p.id.substr(0, 6)}`,
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