// Cloudflare Worker for GoKarts Multiplayer
// This would replace our Node.js server

export default {
  async fetch(request, env, ctx) {
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('GoKarts Multiplayer Server is running! Use WebSocket to connect.', { 
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      server.accept();
      
      // Get or create game room
      const gameRoomId = env.GAME_ROOMS.idFromName('default');
      const gameRoom = env.GAME_ROOMS.get(gameRoomId);
      
      // Handle the WebSocket in the Durable Object
      await gameRoom.fetch(new Request('https://dummy-url', {
        method: 'POST',
        webSocket: server
      }));

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    } catch (error) {
      console.error('WebSocket error:', error);
      return new Response('WebSocket connection failed: ' + error.message, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  },
};

// Durable Object for game state
export class GameRoom {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.sessions = new Set();
    this.players = new Map();
    this.gameState = 'waiting';
  }

  async fetch(request) {
    // Get the WebSocket from the main worker
    let websocket = request.webSocket;
    
    if (!websocket) {
      console.error('No WebSocket provided to Durable Object');
      return new Response('WebSocket required', { status: 400 });
    }
    
    // Accept and handle the WebSocket
    websocket.accept();
    this.sessions.add(websocket);
    
    websocket.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received message:', data.type);
        this.handleMessage(websocket, data);
      } catch (error) {
        console.error('Message parse error:', error);
      }
    });
    
    websocket.addEventListener('close', event => {
      console.log('Player disconnected:', event.code, event.reason);
      this.sessions.delete(websocket);
      this.players.delete(websocket);
    });

    websocket.addEventListener('error', event => {
      console.error('WebSocket error in Durable Object:', event);
      this.sessions.delete(websocket);
      this.players.delete(websocket);
    });

    return new Response('WebSocket handled', { status: 200 });
  }

  handleMessage(websocket, message) {
    switch (message.type) {
      case 'player-identify':
        this.players.set(websocket, {
          id: this.generateId(),
          name: message.name,
          position: { x: 0.8, y: 0.5, angle: 0 }
        });
        break;
        
      case 'find-match':
        this.startMatchmaking(websocket);
        break;
        
      case 'player-update':
        this.broadcastPlayerUpdate(websocket, message);
        break;
    }
  }

  startMatchmaking(websocket) {
    // Broadcast to all players in room
    const roomData = {
      type: 'room-update',
      playersCount: this.sessions.size,
      maxPlayers: 5,
      players: Array.from(this.players.values()).map(p => ({ id: p.id, name: p.name }))
    };
    
    this.broadcast(JSON.stringify(roomData));
    
    // Only start race automatically if we have 2+ players or after 10 seconds with 1 player
    if (this.gameState === 'waiting') {
      if (this.sessions.size >= 2) {
        // Start race quickly with multiple players
        setTimeout(() => {
          if (this.gameState === 'waiting') {
            this.startRace();
          }
        }, 3000);
      } else if (this.sessions.size === 1) {
        // Wait longer for single player to give others time to join
        setTimeout(() => {
          if (this.gameState === 'waiting' && this.sessions.size >= 1) {
            this.startRace();
          }
        }, 10000);
      }
    }
  }

  startRace() {
    this.gameState = 'racing';
    
    // Create bots to fill empty slots
    const botsNeeded = Math.min(5 - this.sessions.size, 4);
    const bots = [];
    const botNames = ['SpeedBot', 'RacerAI', 'TurboBot', 'ZoomBot'];
    
    for (let i = 0; i < botsNeeded; i++) {
      bots.push({
        id: `bot_${i}`,
        name: botNames[i],
        isBot: true,
        position: { 
          x: 0.8, 
          y: 0.5, 
          angle: Math.atan2(0.72 - 0.8, -(0.68 - 0.5)),
          lapCount: 1,
          nextCheckpoint: 0
        }
      });
    }
    
    // Combine human players and bots
    const allPlayers = [
      ...Array.from(this.players.values()),
      ...bots
    ];
    
    const raceStartData = {
      type: 'race-start',
      players: allPlayers,
      startTime: Date.now()
    };
    
    this.broadcast(JSON.stringify(raceStartData));
    
    // Start bot AI if we have bots
    if (bots.length > 0) {
      this.startBotAI(bots);
    }
  }

  startBotAI(bots) {
    // Checkpoint positions
    const checkpoints = [
      { x: 0.655, y: 0.835 }, // CP1 center
      { x: 0.425, y: 0.86 },  // CP2 center  
      { x: 0.195, y: 0.71 },  // CP3 center
      { x: 0.115, y: 0.38 },  // CP4 center
      { x: 0.265, y: 0.175 }, // CP5 center
      { x: 0.385, y: 0.33 },  // CP6 center
      { x: 0.385, y: 0.57 },  // CP7 center
      { x: 0.575, y: 0.525 }, // CP8 center
      { x: 0.63, y: 0.26 },   // CP9 center
      { x: 0.8, y: 0.21 }     // CP10 center
    ];
    
    // Update bot positions every 50ms
    const botInterval = setInterval(() => {
      if (this.gameState !== 'racing') {
        clearInterval(botInterval);
        return;
      }
      
      bots.forEach(bot => {
        const currentCheckpoint = bot.position.nextCheckpoint || 0;
        
        if (currentCheckpoint < checkpoints.length) {
          const target = checkpoints[currentCheckpoint];
          
          // Move toward target
          const dx = target.x - bot.position.x;
          const dy = target.y - bot.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0.01) {
            const speed = 0.006 + Math.random() * 0.002; // Variable bot speed
            bot.position.x += (dx / distance) * speed;
            bot.position.y += (dy / distance) * speed;
            bot.position.angle = Math.atan2(dx, -dy);
            
            // Check if reached checkpoint
            if (distance < 0.06) {
              bot.position.nextCheckpoint = currentCheckpoint + 1;
            }
          }
        } else {
          // Head to start/finish line
          const target = { x: 0.8125, y: 0.5175 }; // Start/finish center
          const dx = target.x - bot.position.x;
          const dy = target.y - bot.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance > 0.01) {
            const speed = 0.006;
            bot.position.x += (dx / distance) * speed;
            bot.position.y += (dy / distance) * speed;
            bot.position.angle = Math.atan2(dx, -dy);
            
            // Check if completed lap
            if (distance < 0.06) {
              bot.position.lapCount = (bot.position.lapCount || 1) + 1;
              bot.position.nextCheckpoint = 0;
            }
          }
        }
        
        // Broadcast bot position
        const botUpdate = {
          type: 'player-position',
          playerId: bot.id,
          x: bot.position.x,
          y: bot.position.y,
          angle: bot.position.angle,
          lapCount: bot.position.lapCount || 1,
          nextCheckpoint: bot.position.nextCheckpoint || 0,
          speed: 3.5
        };
        
        this.broadcast(JSON.stringify(botUpdate));
      });
    }, 50); // 20 FPS updates
  }

  broadcastPlayerUpdate(websocket, message) {
    // Update player position
    const player = this.players.get(websocket);
    if (player) {
      player.position = {
        x: message.x,
        y: message.y,
        angle: message.angle,
        lapCount: message.lapCount,
        nextCheckpoint: message.nextCheckpoint
      };
      
      // Broadcast to other players
      const updateData = {
        type: 'player-position',
        playerId: player.id,
        ...message
      };
      
      this.sessions.forEach(session => {
        if (session !== websocket) {
          try {
            session.send(JSON.stringify(updateData));
          } catch (err) {
            this.sessions.delete(session);
          }
        }
      });
    }
  }

  broadcast(message) {
    this.sessions.forEach(session => {
      try {
        session.send(message);
      } catch (err) {
        // Handle closed connections
        this.sessions.delete(session);
      }
    });
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}