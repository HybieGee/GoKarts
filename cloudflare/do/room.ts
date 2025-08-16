// RoomDO - Manages one race room
interface Env {
  ROOM_HEARTBEAT_MS?: string;
}

interface Member {
  playerId: string;
  websocket: WebSocket;
  joinedAt: number;
  lastHeartbeat: number;
  ready: boolean;
}

interface GamePosition {
  x: number;
  y: number;
  angle: number;
  lapCount?: number;
  nextCheckpoint?: number;
  speed?: number;
}

export class RoomDO {
  private members = new Map<string, Member>();
  private gameState: 'waiting' | 'starting' | 'racing' = 'waiting';
  private maxPlayers = 5;
  private minPlayers = 2;
  private idleTimeoutMs: number;
  private heartbeatInterval: any = null;
  private roomId: string | null = null;

  constructor(private controller: DurableObjectState, private env: Env) {
    this.idleTimeoutMs = parseInt(env.ROOM_HEARTBEAT_MS || '30000'); // 30s heartbeat timeout
  }

  async fetch(request: Request): Promise<Response> {
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
        const data = JSON.parse(event.data as string);
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

  private handleRoomMessage(websocket: WebSocket, message: any): void {
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

  private handlePlayerJoin(websocket: WebSocket, playerId: string): void {
    if (this.members.size >= this.maxPlayers) {
      this.sendMessage(websocket, { t: "KICK", reason: "Room full" });
      websocket.close();
      return;
    }

    const member: Member = {
      playerId,
      websocket,
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
      ready: false
    };

    this.members.set(playerId, member);
    console.log(`ROOM:JOIN room=${this.roomId} player=${playerId} members=${this.members.size}/${this.maxPlayers}`);

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

  private handlePing(websocket: WebSocket): void {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member) {
      member.lastHeartbeat = Date.now();
      this.sendMessage(websocket, { t: "PONG" });
    }
  }

  private handleGameState(websocket: WebSocket, message: { pos: GamePosition }): void {
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

  private handleRaceFinish(websocket: WebSocket, message: { playerId: string, finalTime: number, lapCount: number }): void {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (!member || this.gameState !== 'racing') {
      return;
    }

    console.log(`ROOM:RACE_FINISH room=${this.roomId} player=${message.playerId} lapCount=${message.lapCount}`);
    
    // Mark the race as ended and broadcast to all players
    this.gameState = 'finished';
    
    // Get all players for final positions with proper ranking
    const allPlayers = Array.from(this.members.values()).map((m, index) => ({
      id: m.playerId,
      name: `Player_${m.playerId.substring(0, 6)}`,
      isBot: false,
      position: index + 1
    }));

    // Put winner first
    const winnerIndex = allPlayers.findIndex(p => p.id === message.playerId);
    if (winnerIndex > 0) {
      const winner = allPlayers.splice(winnerIndex, 1)[0];
      winner.position = 1;
      allPlayers.unshift(winner);
      // Update positions for remaining players
      allPlayers.forEach((player, index) => {
        if (index > 0) player.position = index + 1;
      });
    }

    // Broadcast race end to all players
    this.broadcast({
      t: "RACE_END",
      winner: {
        id: message.playerId,
        name: `Player_${message.playerId.substring(0, 6)}`,
        isBot: false
      },
      finalPositions: allPlayers,
      finalTime: message.finalTime
    });

    // Schedule room cleanup after results are shown
    setTimeout(() => {
      console.log(`ROOM:CLEANUP room=${this.roomId} reason=race_ended`);
      this.broadcast({ t: "END", reason: "Race completed" });
      // Room will be cleaned up when all players disconnect
    }, 10000); // 10 seconds to show results
  }

  private startCountdown(): void {
    this.gameState = 'starting';
    this.broadcast({ t: "START", countdown: 3 });
    console.log(`ROOM:START room=${this.roomId} players=${this.members.size} countdown=3`);
    
    setTimeout(() => {
      this.gameState = 'racing';
      console.log(`ROOM:RACE_START room=${this.roomId} players=${this.members.size}`);
    }, 3000);
  }

  private sendMessage(websocket: WebSocket, message: any): void {
    try {
      websocket.send(JSON.stringify(message));
    } catch (err) {
      console.error('Failed to send message:', err);
      this.removeMemberByWebSocket(websocket);
    }
  }

  private broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.members.forEach((member) => {
      try {
        member.websocket.send(messageStr);
      } catch (err) {
        this.removeMemberByWebSocket(member.websocket);
      }
    });
  }

  private broadcastExcept(excludeWebSocket: WebSocket, message: any): void {
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

  private removeMemberByWebSocket(websocket: WebSocket): void {
    const member = Array.from(this.members.values()).find(m => m.websocket === websocket);
    if (member) {
      const playerId = member.playerId;
      this.members.delete(playerId);
      console.log(`ROOM:PEER_LEAVE room=${this.roomId} player=${playerId} members=${this.members.size}/${this.maxPlayers}`);
      
      // Notify other players
      this.broadcast({ t: "PEER_LEAVE", playerId });
      
      if (this.members.size === 0) {
        this.stopHeartbeatMonitoring();
        console.log(`ROOM:END room=${this.roomId} reason=empty_room closeIn=30s`);
        // End room after 30 seconds of being empty
        setTimeout(() => {
          if (this.members.size === 0) {
            console.log(`ROOM:DESTROY room=${this.roomId} reason=empty_30s`);
            this.broadcast({ t: "END", reason: "Empty room" });
          }
        }, 30000);
      }
    }
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const toRemove: string[] = [];

      this.members.forEach((member, id) => {
        if (now - member.lastHeartbeat > this.idleTimeoutMs) {
          toRemove.push(id);
        }
      });

      toRemove.forEach(id => {
        const member = this.members.get(id);
        console.log(`ROOM:PEER_TIMEOUT room=${this.roomId} player=${id} duration=${Math.round(this.idleTimeoutMs/1000)}s`);
        if (member) {
          this.removeMemberByWebSocket(member.websocket);
        }
      });
    }, 5000);
  }

  private stopHeartbeatMonitoring(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}