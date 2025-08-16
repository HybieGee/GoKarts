// LeaderboardDO - Global leaderboard tracking wins
interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  wins: number;
  lastWin?: number;
  totalRaces: number;
}

export class LeaderboardDO {
  private leaderboard = new Map<string, LeaderboardEntry>();
  private connectedClients = new Set<WebSocket>();

  constructor(private controller: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket connections for live updates
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);
      server.accept();
      
      this.connectedClients.add(server);
      
      // Send current leaderboard to new connection
      server.send(JSON.stringify({
        type: 'leaderboard-update',
        data: this.getTopPlayers()
      }));
      
      server.addEventListener('close', () => {
        this.connectedClients.delete(server);
      });
      
      return new Response(null, { status: 101, webSocket: client });
    }
    
    // REST API endpoints
    if (url.pathname === '/record-win' && request.method === 'POST') {
      const { playerId, playerName } = await request.json() as { playerId: string, playerName: string };
      await this.recordWin(playerId, playerName);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/record-race' && request.method === 'POST') {
      const { playerId, playerName } = await request.json() as { playerId: string, playerName: string };
      await this.recordRace(playerId, playerName);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/get' && request.method === 'GET') {
      return new Response(JSON.stringify(this.getTopPlayers()), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/reset' && request.method === 'POST') {
      // Admin endpoint to reset leaderboard (protect this in production!)
      await this.resetLeaderboard();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not Found', { status: 404 });
  }

  private async recordWin(playerId: string, playerName: string): Promise<void> {
    // Load from storage if not in memory
    if (this.leaderboard.size === 0) {
      await this.loadFromStorage();
    }
    
    const entry = this.leaderboard.get(playerId) || {
      playerId,
      playerName,
      wins: 0,
      totalRaces: 0
    };
    
    entry.wins++;
    entry.totalRaces++;
    entry.lastWin = Date.now();
    entry.playerName = playerName; // Update name in case it changed
    
    this.leaderboard.set(playerId, entry);
    
    // Save to storage
    await this.controller.storage.put(playerId, entry);
    
    // Broadcast update to all connected clients
    this.broadcastUpdate();
    
    console.log(`LEADERBOARD:WIN player=${playerName} totalWins=${entry.wins}`);
  }

  private async recordRace(playerId: string, playerName: string): Promise<void> {
    // Load from storage if not in memory
    if (this.leaderboard.size === 0) {
      await this.loadFromStorage();
    }
    
    const entry = this.leaderboard.get(playerId) || {
      playerId,
      playerName,
      wins: 0,
      totalRaces: 0
    };
    
    entry.totalRaces++;
    entry.playerName = playerName; // Update name in case it changed
    
    this.leaderboard.set(playerId, entry);
    
    // Save to storage
    await this.controller.storage.put(playerId, entry);
    
    console.log(`LEADERBOARD:RACE player=${playerName} totalRaces=${entry.totalRaces}`);
  }

  private async loadFromStorage(): Promise<void> {
    const entries = await this.controller.storage.list<LeaderboardEntry>();
    entries.forEach((value, key) => {
      if (typeof key === 'string') {
        this.leaderboard.set(key, value);
      }
    });
    console.log(`LEADERBOARD:LOADED entries=${this.leaderboard.size}`);
  }

  private getTopPlayers(limit: number = 100): LeaderboardEntry[] {
    return Array.from(this.leaderboard.values())
      .sort((a, b) => {
        // Sort by wins (descending), then by last win time (most recent first)
        if (b.wins !== a.wins) return b.wins - a.wins;
        return (b.lastWin || 0) - (a.lastWin || 0);
      })
      .slice(0, limit);
  }

  private broadcastUpdate(): void {
    const message = JSON.stringify({
      type: 'leaderboard-update',
      data: this.getTopPlayers()
    });
    
    this.connectedClients.forEach(client => {
      try {
        client.send(message);
      } catch (err) {
        this.connectedClients.delete(client);
      }
    });
  }

  private async resetLeaderboard(): Promise<void> {
    await this.controller.storage.deleteAll();
    this.leaderboard.clear();
    this.broadcastUpdate();
    console.log('LEADERBOARD:RESET');
  }
}