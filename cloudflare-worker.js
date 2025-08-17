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
      
      // Leaderboard API endpoint
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        const leaderboardId = env.LEADERBOARD.idFromName('global-leaderboard');
        const leaderboard = env.LEADERBOARD.get(leaderboardId);
        const response = await leaderboard.fetch(new Request('https://dummy-url/get-leaderboard', {
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
      
      if (url.pathname === '/ws/leaderboard') {
        const leaderboardId = env.LEADERBOARD.idFromName('global-leaderboard');
        const leaderboard = env.LEADERBOARD.get(leaderboardId);
        return leaderboard.fetch(request);
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
    this.matchStartTimeout = null; // Countdown timer
    this.matchCountdownMs = 15000; // 15 seconds to wait for more players
    this.countdownStartDelay = 2000; // 2 second delay before starting countdown
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

    // Check if we have enough players to start countdown
    if (this.queue.length >= this.minPlayersToStart) {
      // If we have max players, start immediately
      if (this.queue.length >= this.roomSize) {
        return await this.startMatch();
      }
      
      // If countdown not already started, start it with a delay
      if (!this.matchStartTimeout) {
        console.log(`⏳ Waiting ${this.countdownStartDelay/1000}s before starting countdown (${this.queue.length} players in queue)`);
        // Add a small delay before starting countdown to allow rapid joins
        setTimeout(() => {
          if (this.queue.length >= this.minPlayersToStart && !this.matchStartTimeout) {
            console.log(`⏰ Starting ${this.matchCountdownMs/1000}s countdown with ${this.queue.length} players`);
            this.matchStartTimeout = setTimeout(async () => {
              if (this.queue.length >= this.minPlayersToStart) {
                await this.startMatch();
              }
              this.matchStartTimeout = null;
            }, this.matchCountdownMs);
          }
        }, this.countdownStartDelay);
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
      
      // If we had a countdown but now don't have enough players, cancel it
      if (this.matchStartTimeout && this.queue.length < this.minPlayersToStart) {
        console.log(`❌ Cancelling countdown - insufficient players after cancellation`);
        clearTimeout(this.matchStartTimeout);
        this.matchStartTimeout = null;
      }
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

    // Check if countdown should start or match should begin
    if (this.queue.length >= this.minPlayersToStart && playerIndex < this.roomSize) {
      // If we have max players, start immediately
      if (this.queue.length >= this.roomSize) {
        const matchResult = await this.startMatch();
        return matchResult;
      }
      
      // If countdown not already started, start it with a delay
      if (!this.matchStartTimeout) {
        console.log(`⏳ Waiting ${this.countdownStartDelay/1000}s before starting countdown (${this.queue.length} players in queue)`);
        // Add a small delay before starting countdown to allow rapid joins
        setTimeout(() => {
          if (this.queue.length >= this.minPlayersToStart && !this.matchStartTimeout) {
            console.log(`⏰ Starting ${this.matchCountdownMs/1000}s countdown with ${this.queue.length} players`);
            this.matchStartTimeout = setTimeout(async () => {
              if (this.queue.length >= this.minPlayersToStart) {
                await this.startMatch();
              }
              this.matchStartTimeout = null;
            }, this.matchCountdownMs);
          }
        }, this.countdownStartDelay);
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

  async startMatch() {
    if (this.queue.length < this.minPlayersToStart) {
      console.log(`❌ Cannot start match - insufficient players: ${this.queue.length}/${this.minPlayersToStart}`);
      return;
    }
    
    const playersForRoom = this.queue.splice(0, Math.min(this.roomSize, this.queue.length));
    const roomData = await this.createRoom(playersForRoom.length);
    
    console.log(`🎯 [${roomData.roomId}] MATCH_STARTED - players: ${playersForRoom.map(p => p.playerId).join(', ')}`);
    
    // Clear the countdown since we're starting
    if (this.matchStartTimeout) {
      clearTimeout(this.matchStartTimeout);
      this.matchStartTimeout = null;
    }
    
    // Return response for the first player (others will get it via polling)
    return new Response(JSON.stringify({
      status: "matched",
      roomId: roomData.roomId,
      wsUrl: roomData.wsUrl
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
    
    // If we had a countdown but now don't have enough players, cancel it
    if (this.matchStartTimeout && this.queue.length < this.minPlayersToStart) {
      console.log(`❌ Cancelling countdown - insufficient players after cleanup`);
      clearTimeout(this.matchStartTimeout);
      this.matchStartTimeout = null;
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
      case 'RACE_FINISH':
        this.handleRaceFinish(websocket, message);
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

  async handleRaceFinish(websocket, message) {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member && message.playerId && message.playerName) {
      console.log(`🏆 [${this.roomId}] RACE_WINNER: ${message.playerName} (${message.playerId})`);
      
      // Report win to leaderboard
      try {
        const leaderboardId = this.env.LEADERBOARD.idFromName('global-leaderboard');
        const leaderboard = this.env.LEADERBOARD.get(leaderboardId);
        await leaderboard.fetch(new Request('https://dummy-url/record-win', {
          method: 'POST',
          body: JSON.stringify({
            playerId: message.playerId,
            playerName: message.playerName,
            raceTime: message.raceTime || 0
          })
        }));
      } catch (error) {
        console.error('Failed to record win:', error);
      }
      
      // Broadcast race end to all players
      this.broadcast({
        t: "RACE_END",
        winner: {
          playerId: message.playerId,
          playerName: message.playerName
        }
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

// LeaderboardDO - Global leaderboard with persistent storage
export class LeaderboardDO {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.subscribers = new Set(); // WebSocket connections for live updates
  }

  async fetch(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    // Handle WebSocket connections
    if (upgradeHeader && upgradeHeader === 'websocket') {
      return this.handleWebSocket(request);
    }

    // Handle REST API endpoints
    if (url.pathname === '/get-leaderboard' && request.method === 'GET') {
      return this.getLeaderboard();
    }

    if (url.pathname === '/record-win' && request.method === 'POST') {
      const data = await request.json();
      return this.recordWin(data);
    }

    return new Response('Not Found', { status: 404 });
  }

  async handleWebSocket(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    server.accept();

    // Add to subscribers for live updates
    this.subscribers.add(server);

    server.addEventListener('close', () => {
      this.subscribers.delete(server);
    });

    server.addEventListener('error', () => {
      this.subscribers.delete(server);
    });

    // Send current leaderboard data immediately
    const leaderboardData = await this.getLeaderboardData();
    this.sendToClient(server, {
      type: 'leaderboard-update',
      data: leaderboardData
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async getLeaderboard() {
    const data = await this.getLeaderboardData();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async recordWin(data) {
    const { playerId, playerName, raceTime } = data;
    
    // Validate input
    if (!playerId || !playerName) {
      return new Response(JSON.stringify({ error: 'Missing playerId or playerName' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get current leaderboard data
    const leaderboard = await this.controller.storage.get('leaderboard') || {};
    
    // Create normalized player key (use playerId as primary key)
    const playerKey = playerId;
    
    if (!leaderboard[playerKey]) {
      leaderboard[playerKey] = {
        playerId,
        playerName,
        wins: 0,
        totalRaces: 0,
        bestTime: null,
        lastWin: null
      };
    }

    // Update player stats
    leaderboard[playerKey].wins += 1;
    leaderboard[playerKey].totalRaces += 1;
    leaderboard[playerKey].playerName = playerName; // Update name in case it changed
    leaderboard[playerKey].lastWin = Date.now();
    
    if (raceTime && (!leaderboard[playerKey].bestTime || raceTime < leaderboard[playerKey].bestTime)) {
      leaderboard[playerKey].bestTime = raceTime;
    }

    // Save updated leaderboard
    await this.controller.storage.put('leaderboard', leaderboard);

    // Broadcast update to all subscribers
    const sortedData = await this.getLeaderboardData();
    this.broadcastUpdate(sortedData);

    console.log(`🏆 LEADERBOARD: ${playerName} (${playerId}) now has ${leaderboard[playerKey].wins} wins`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async getLeaderboardData() {
    const leaderboard = await this.controller.storage.get('leaderboard') || {};
    
    // Convert to array and aggressively deduplicate
    const entries = Object.values(leaderboard);
    
    // Group by normalized name to remove duplicates
    const uniqueEntries = new Map();
    entries.forEach(entry => {
      const normalizedName = (entry.playerName || '').toLowerCase().trim();
      const existing = uniqueEntries.get(normalizedName);
      
      // Keep the entry with more wins, or the more recent one
      if (!existing || entry.wins > existing.wins || 
          (entry.wins === existing.wins && entry.lastWin > existing.lastWin)) {
        uniqueEntries.set(normalizedName, entry);
      }
    });
    
    // Convert back to array and sort by wins (descending), then by win rate
    const sortedEntries = Array.from(uniqueEntries.values())
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        const aWinRate = a.totalRaces > 0 ? a.wins / a.totalRaces : 0;
        const bWinRate = b.totalRaces > 0 ? b.wins / b.totalRaces : 0;
        return bWinRate - aWinRate;
      })
      .slice(0, 50); // Top 50 players to reduce bloat

    console.log(`📊 LEADERBOARD: ${entries.length} raw entries -> ${sortedEntries.length} unique entries`);
    return sortedEntries;
  }

  broadcastUpdate(data) {
    const message = JSON.stringify({
      type: 'leaderboard-update',
      data
    });

    this.subscribers.forEach(client => {
      this.sendToClient(client, message);
    });
  }

  sendToClient(client, data) {
    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      client.send(message);
    } catch (error) {
      console.error('Failed to send to client:', error);
      this.subscribers.delete(client);
    }
  }
}