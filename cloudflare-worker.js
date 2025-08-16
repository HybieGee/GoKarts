// Cloudflare Worker for GoKarts Multiplayer
// VERSION 4.0 - PROPER MATCHMAKING ARCHITECTURE

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }
    
    // Handle REST API endpoints
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      // Queue join endpoint
      if (url.pathname === '/api/queue/join' && request.method === 'POST') {
        const { playerId } = await request.json();
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        const response = await matchmaker.fetch(new Request('https://dummy-url/join', {
          method: 'POST',
          body: JSON.stringify({ playerId })
        }));
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Queue cancel endpoint
      if (url.pathname === '/api/queue/cancel' && request.method === 'POST') {
        const { playerId } = await request.json();
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        await matchmaker.fetch(new Request('https://dummy-url/cancel', {
          method: 'POST',
          body: JSON.stringify({ playerId })
        }));
        return new Response(JSON.stringify({ status: "cancelled" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Queue poll endpoint
      if (url.pathname === '/api/queue/poll' && request.method === 'GET') {
        const playerId = url.searchParams.get('playerId');
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        const response = await matchmaker.fetch(new Request(`https://dummy-url/poll?playerId=${playerId}`, {
          method: 'GET'
        }));
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Health check
      if (url.pathname === '/health') {
        return new Response('GoKarts Multiplayer Server is running!', { 
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        });
      }
      
      return new Response('Not Found', { status: 404, headers: corsHeaders });
    }

    try {
      // WebSocket routing
      if (url.pathname.startsWith('/ws/room/')) {
        const roomId = url.pathname.split('/')[3];
        const roomDOId = env.ROOM_DO.idFromName(roomId);
        const roomDO = env.ROOM_DO.get(roomDOId);
        return roomDO.fetch(request);
      }
      
      return new Response('WebSocket endpoint not found', { status: 404 });
    } catch (error) {
      console.error('WebSocket routing error:', error);
      return new Response('WebSocket connection failed: ' + error.message, { 
        status: 500,
        headers: corsHeaders
      });
    }
  },
};

// MatchmakerDO - Single global queue with capacity checks
export class MatchmakerDO {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.queue = [];
    this.roomSize = 5;
    this.minPlayersToStart = 2;
    this.ttlMs = 20000; // 20 seconds timeout
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // Handle REST API endpoints
    if (url.pathname === '/join' && request.method === 'POST') {
      const { playerId } = await request.json();
      return await this.handleJoin(playerId);
    }
    
    if (url.pathname === '/cancel' && request.method === 'POST') {
      const { playerId } = await request.json();
      return await this.handleCancel(playerId);
    }
    
    if (url.pathname.startsWith('/poll') && request.method === 'GET') {
      const playerId = url.searchParams.get('playerId');
      return await this.handlePoll(playerId);
    }
    
    return new Response('Not Found', { status: 404 });
  }

  async handleJoin(playerId) {
    // Clean expired entries first
    this.cleanExpiredEntries();
    
    // Check for idempotency - if player is already in queue, just return their status
    const existingPlayer = this.queue.find(p => p.playerId === playerId);
    if (existingPlayer) {
      console.log(`🔄 [${playerId}] IDEMPOTENT_ENQUEUE - already in queue`);
      const position = this.queue.findIndex(p => p.playerId === playerId) + 1;
      const estWaitSec = Math.max(0, (position - 1) * 10);
      
      return new Response(JSON.stringify({
        status: "queued",
        position,
        estWaitSec
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const playerEntry = {
      playerId,
      enqueuedAt: Date.now(),
      ttlMs: this.ttlMs
    };

    this.queue.push(playerEntry);
    console.log(`🏁 [${playerId}] ENQUEUE - queue size: ${this.queue.length}`);

    // Check if we can form a room immediately
    if (this.queue.length >= this.minPlayersToStart) {
      const playersForRoom = this.queue.splice(0, this.roomSize);
      const roomData = await this.createRoom(playersForRoom.length);
      
      console.log(`🎯 [${roomData.roomId}] MATCHED - players: ${playersForRoom.map(p => p.playerId).join(', ')}`);
      
      // Mark this player as matched (they'll be removed from the response)
      const thisPlayerIndex = playersForRoom.findIndex(p => p.playerId === playerId);
      if (thisPlayerIndex !== -1) {
        return new Response(JSON.stringify({
          status: "matched",
          roomId: roomData.roomId,
          wsUrl: roomData.wsUrl
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Player is now queued
    const position = this.queue.findIndex(p => p.playerId === playerId) + 1;
    const estWaitSec = Math.max(0, (position - 1) * 10); // rough estimate
    
    return new Response(JSON.stringify({
      status: "queued",
      position,
      estWaitSec
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handleCancel(playerId) {
    const wasInQueue = this.queue.some(p => p.playerId === playerId);
    this.removeFromQueue(playerId);
    
    if (wasInQueue) {
      console.log(`❌ [${playerId}] DEQUEUE - cancelled by user`);
    }
    
    return new Response(JSON.stringify({ status: "cancelled" }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async handlePoll(playerId) {
    this.cleanExpiredEntries();
    
    const playerIndex = this.queue.findIndex(p => p.playerId === playerId);
    
    if (playerIndex === -1) {
      return new Response(JSON.stringify({ status: "timeout" }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if player has expired
    const player = this.queue[playerIndex];
    if (Date.now() - player.enqueuedAt > player.ttlMs) {
      this.removeFromQueue(playerId);
      return new Response(JSON.stringify({ status: "timeout" }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if we can form a room
    if (this.queue.length >= this.minPlayersToStart && playerIndex < this.roomSize) {
      const playersForRoom = this.queue.splice(0, this.roomSize);
      const roomData = await this.createRoom(playersForRoom.length);
      
      // This player is in the room
      if (playersForRoom.some(p => p.playerId === playerId)) {
        return new Response(JSON.stringify({
          status: "matched",
          roomId: roomData.roomId,
          wsUrl: roomData.wsUrl
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Still queued
    const position = playerIndex + 1;
    const estWaitSec = Math.max(0, (position - 1) * 10);
    
    return new Response(JSON.stringify({
      status: "queued",
      position,
      estWaitSec
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  cleanExpiredEntries() {
    const now = Date.now();
    const before = this.queue.length;
    const expiredPlayers = this.queue.filter(p => now - p.enqueuedAt >= p.ttlMs);
    this.queue = this.queue.filter(p => now - p.enqueuedAt < p.ttlMs);
    
    // Log expired players
    expiredPlayers.forEach(p => {
      console.log(`⏰ [${p.playerId}] DEQUEUE - timeout (${Math.round((now - p.enqueuedAt) / 1000)}s)`);
    });
    
    if (before !== this.queue.length) {
      console.log(`🧹 Queue cleanup: ${before} -> ${this.queue.length} (removed ${before - this.queue.length} expired)`);
    }
  }


  async createRoom(size) {
    const registryId = this.env.ROOM_REGISTRY.idFromName('global-registry');
    const registry = this.env.ROOM_REGISTRY.get(registryId);
    
    const response = await registry.fetch(new Request('https://dummy-url/create-room', {
      method: 'POST',
      body: JSON.stringify({ size })
    }));
    
    const result = await response.json();
    
    // Convert roomWebSocketPath to full wsUrl
    const baseUrl = 'wss://gokarts-multiplayer.stealthbundlebot.workers.dev';
    result.wsUrl = `${baseUrl}${result.roomWebSocketPath}`;
    
    return result;
  }

  removeFromQueue(playerId) {
    const index = this.queue.findIndex(p => p.playerId === playerId);
    if (index > -1) {
      this.queue.splice(index, 1);
      // Logging is done by the caller to provide context
    }
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// RoomRegistryDO - Map of roomId -> RoomDO id
export class RoomRegistryDO {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.rooms = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (request.method === 'POST' && url.pathname === '/create-room') {
      const { size } = await request.json();
      return this.createRoom(size);
    }

    return new Response('Method not allowed', { status: 405 });
  }

  async createRoom(size) {
    const roomId = this.generateRoomId();
    const roomWebSocketPath = `/ws/room/${roomId}`;
    
    // Store room mapping
    this.rooms.set(roomId, {
      id: roomId,
      maxPlayers: size,
      createdAt: Date.now()
    });

    console.log(`🏠 Created room ${roomId} for ${size} players`);

    return new Response(JSON.stringify({
      roomId,
      roomWebSocketPath
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  generateRoomId() {
    return 'room_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  }
}

// RoomDO - Manages one race room
export class RoomDO {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.members = new Map();
    this.gameState = 'waiting';
    this.maxPlayers = 5;
    this.minPlayers = 2;
    this.idleTimeoutMs = 30000; // 30s heartbeat timeout
    this.heartbeatInterval = null;
    this.roomId = null;
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();

    // Extract room ID from URL if not set
    if (!this.roomId) {
      const url = new URL(request.url);
      this.roomId = url.pathname.split('/')[3] || this.generateId();
    }

    console.log(`🏠 New connection to room ${this.roomId}. Current members: ${this.members.size}`);

    // Start heartbeat monitoring if first player
    if (this.members.size === 0) {
      this.startHeartbeatMonitoring();
    }

    server.addEventListener('message', event => {
      try {
        const data = JSON.parse(event.data);
        this.handleRoomMessage(server, data);
      } catch (error) {
        console.error('Room message error:', error);
        this.sendMessage(server, { t: "KICK", reason: "Invalid message format" });
        server.close();
      }
    });

    server.addEventListener('close', () => {
      this.removeMemberByWebSocket(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  handleRoomMessage(websocket, message) {
    switch (message.t) {
      case 'HELLO':
        this.handlePlayerJoin(websocket, message.playerId);
        break;
      case 'PING':
        this.handlePing(websocket);
        break;
      case 'STATE':
        this.handleGameState(websocket, message);
        break;
      default:
        console.warn('Unknown message type:', message.t);
    }
  }

  handlePlayerJoin(websocket, playerId) {
    if (this.members.size >= this.maxPlayers) {
      this.sendMessage(websocket, { t: "KICK", reason: "Room full" });
      websocket.close();
      return;
    }

    const member = {
      playerId,
      websocket,
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
      ready: false
    };

    this.members.set(playerId, member);
    console.log(`🏠 [${this.roomId}] [${playerId}] ROOM_JOIN - members: ${this.members.size}/${this.maxPlayers}`);

    // Send welcome message
    this.sendMessage(websocket, {
      t: "WELCOME",
      roomId: this.roomId,
      players: Array.from(this.members.keys())
    });

    // Notify other players
    this.broadcastExcept(websocket, { t: "PEER_JOIN", playerId });

    // Check if we can start
    if (this.members.size >= this.minPlayers && this.gameState === 'waiting') {
      setTimeout(() => {
        if (this.gameState === 'waiting') {
          this.startCountdown();
        }
      }, 2000);
    }
  }

  handlePing(websocket) {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member) {
      member.lastHeartbeat = Date.now();
      this.sendMessage(websocket, { t: "PONG" });
    }
  }

  handleGameState(websocket, message) {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member) {
      member.lastHeartbeat = Date.now();
      // Broadcast game state to other players
      this.broadcastExcept(websocket, {
        t: "PEER_STATE",
        playerId: member.playerId,
        pos: message.pos
      });
    }
  }

  startCountdown() {
    this.gameState = 'starting';
    this.broadcast({ t: "START", countdown: 3 });
    console.log(`🚀 [${this.roomId}] ROOM_START - countdown started with ${this.members.size} players`);
    
    setTimeout(() => {
      this.gameState = 'racing';
      console.log(`🏁 [${this.roomId}] RACE_STARTED - ${this.members.size} players racing`);
    }, 3000);
  }

  sendMessage(websocket, message) {
    try {
      websocket.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send message:', err);
      this.removeMemberByWebSocket(websocket);
    }
  }

  broadcast(message) {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    this.members.forEach((member) => {
      try {
        member.websocket.send(messageStr);
      } catch (err) {
        this.removeMemberByWebSocket(member.websocket);
      }
    });
  }

  broadcastExcept(excludeWebSocket, message) {
    const messageStr = JSON.stringify(message);
    this.members.forEach((member) => {
      if (member.websocket !== excludeWebSocket) {
        try {
          member.websocket.send(messageStr);
        } catch (err) {
          this.removeMemberByWebSocket(member.websocket);
        }
      }
    });
  }

  removeMemberByWebSocket(websocket) {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member) {
      const playerId = member.playerId;
      this.members.delete(playerId);
      console.log(`👋 [${this.roomId}] [${playerId}] PEER_LEAVE - members: ${this.members.size}/${this.maxPlayers}`);
      
      // Notify other players
      this.broadcast({ t: "PEER_LEAVE", playerId });
      
      if (this.members.size === 0) {
        this.stopHeartbeatMonitoring();
        console.log(`🏁 [${this.roomId}] ROOM_END - empty room, closing in 30s`);
        // End room after 30 seconds of being empty
        setTimeout(() => {
          if (this.members.size === 0) {
            console.log(`💀 [${this.roomId}] ROOM_DESTROYED - empty for 30s`);
            this.broadcast({ t: "END", reason: "Empty room" });
          }
        }, 30000);
      }
    }
  }

  startHeartbeatMonitoring() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const toRemove = [];

      this.members.forEach((member, id) => {
        if (now - member.lastHeartbeat > this.idleTimeoutMs) {
          toRemove.push(id);
        }
      });

      toRemove.forEach(id => {
        const member = this.members.get(id);
        console.log(`⏰ [${this.roomId}] [${id}] PEER_TIMEOUT - no heartbeat for ${Math.round(this.idleTimeoutMs/1000)}s`);
        if (member) {
          this.removeMemberByWebSocket(member.websocket);
        }
      });
    }, 5000);
  }

  stopHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  broadcast(message) {
    this.members.forEach((member, id) => {
      try {
        member.websocket.send(message);
      } catch (err) {
        this.removeMember(id);
      }
    });
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
}