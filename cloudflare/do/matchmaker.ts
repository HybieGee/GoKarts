// MatchmakerDO - Single global queue with capacity checks
interface Env {
  ROOM_REGISTRY: DurableObjectNamespace;
  ROOM_SIZE?: string;
  QUEUE_TTL_MS?: string;
}

interface QueueEntry {
  playerId: string;
  enqueuedAt: number;
  ttlMs: number;
}

export class MatchmakerDO {
  private queue: QueueEntry[] = [];
  private roomSize: number;
  private minPlayersToStart: number;
  private ttlMs: number;

  constructor(private controller: DurableObjectState, private env: Env) {
    this.roomSize = parseInt(env.ROOM_SIZE || '5');
    this.minPlayersToStart = 2;
    this.ttlMs = parseInt(env.QUEUE_TTL_MS || '20000'); // 20 seconds timeout
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle REST API endpoints
    if (url.pathname === '/join' && request.method === 'POST') {
      const { playerId } = await request.json() as { playerId: string };
      return await this.handleJoin(playerId);
    }
    
    if (url.pathname === '/cancel' && request.method === 'POST') {
      const { playerId } = await request.json() as { playerId: string };
      return await this.handleCancel(playerId);
    }
    
    if (url.pathname.startsWith('/poll') && request.method === 'GET') {
      const playerId = url.searchParams.get('playerId');
      if (!playerId) {
        return new Response(JSON.stringify({ error: 'Missing playerId' }), { status: 400 });
      }
      return await this.handlePoll(playerId);
    }
    
    if (url.pathname === '/debug' && request.method === 'GET') {
      return await this.handleDebug();
    }
    
    return new Response('Not Found', { status: 404 });
  }

  private async handleJoin(playerId: string): Promise<Response> {
    // Clean expired entries first
    this.cleanExpiredEntries();
    
    // Check for idempotency - if player is already in queue, just return their status
    const existingPlayer = this.queue.find(p => p.playerId === playerId);
    if (existingPlayer) {
      console.log(`MM:IDEMPOTENT player=${playerId} - already in queue`);
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
    
    const playerEntry: QueueEntry = {
      playerId,
      enqueuedAt: Date.now(),
      ttlMs: this.ttlMs
    };

    this.queue.push(playerEntry);
    console.log(`MM:ENQUEUE player=${playerId} queueSize=${this.queue.length}`);

    // Check if we can form a room immediately
    if (this.queue.length >= this.minPlayersToStart) {
      const playersForRoom = this.queue.splice(0, this.roomSize);
      const roomData = await this.createRoom(playersForRoom.length);
      
      console.log(`MM:MATCH room=${roomData.roomId} size=${playersForRoom.length} players=${playersForRoom.map(p => p.playerId).join(',')}`);
      
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

  private async handleCancel(playerId: string): Promise<Response> {
    const wasInQueue = this.queue.some(p => p.playerId === playerId);
    this.removeFromQueue(playerId);
    
    if (wasInQueue) {
      console.log(`MM:DEQUEUE player=${playerId} reason=cancelled`);
    }
    
    return new Response(JSON.stringify({ status: "cancelled" }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handlePoll(playerId: string): Promise<Response> {
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
      
      console.log(`MM:MATCH room=${roomData.roomId} size=${playersForRoom.length} players=${playersForRoom.map(p => p.playerId).join(',')}`);
      
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

  private cleanExpiredEntries(): void {
    const now = Date.now();
    const before = this.queue.length;
    const expiredPlayers = this.queue.filter(p => now - p.enqueuedAt >= p.ttlMs);
    this.queue = this.queue.filter(p => now - p.enqueuedAt < p.ttlMs);
    
    // Log expired players
    expiredPlayers.forEach(p => {
      console.log(`MM:DEQUEUE player=${p.playerId} reason=timeout duration=${Math.round((now - p.enqueuedAt) / 1000)}s`);
    });
    
    if (before !== this.queue.length) {
      console.log(`MM:CLEANUP before=${before} after=${this.queue.length} removed=${before - this.queue.length}`);
    }
  }

  private async createRoom(size: number): Promise<{ roomId: string; wsUrl: string }> {
    const registryId = this.env.ROOM_REGISTRY.idFromName('global-registry');
    const registry = this.env.ROOM_REGISTRY.get(registryId);
    
    const response = await registry.fetch(new Request('https://dummy-url/create-room', {
      method: 'POST',
      body: JSON.stringify({ size }),
      headers: { 'Content-Type': 'application/json' }
    }));
    
    const result = await response.json() as any;
    
    // Convert roomWebSocketPath to full wsUrl
    const baseUrl = 'wss://gokarts-multiplayer.stealthbundlebot.workers.dev';
    result.wsUrl = `${baseUrl}${result.roomWebSocketPath}`;
    
    return result;
  }

  private removeFromQueue(playerId: string): void {
    const index = this.queue.findIndex(p => p.playerId === playerId);
    if (index > -1) {
      this.queue.splice(index, 1);
      // Logging is done by the caller to provide context
    }
  }

  private async handleDebug(): Promise<Response> {
    this.cleanExpiredEntries();
    
    const debugInfo = {
      queueCount: this.queue.length,
      queuedPlayers: this.queue.slice(0, 5).map(p => p.playerId), // Sample of first 5
      roomSize: this.roomSize,
      minPlayersToStart: this.minPlayersToStart,
      ttlMs: this.ttlMs,
      timestamp: Date.now()
    };

    return new Response(JSON.stringify(debugInfo), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}