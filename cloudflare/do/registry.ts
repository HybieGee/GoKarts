// RoomRegistryDO - Map of roomId -> RoomDO id
interface RoomInfo {
  id: string;
  maxPlayers: number;
  createdAt: number;
}

export class RoomRegistryDO {
  private rooms = new Map<string, RoomInfo>();

  constructor(private controller: DurableObjectState, private env: any) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    if (request.method === 'POST' && url.pathname === '/create-room') {
      const { size } = await request.json() as { size: number };
      return this.createRoom(size);
    }

    return new Response('Method not allowed', { status: 405 });
  }

  private async createRoom(size: number): Promise<Response> {
    const roomId = this.generateRoomId();
    const roomWebSocketPath = `/ws/room/${roomId}`;
    
    // Store room mapping
    this.rooms.set(roomId, {
      id: roomId,
      maxPlayers: size,
      createdAt: Date.now()
    });

    console.log(`REGISTRY:CREATE_ROOM room=${roomId} maxPlayers=${size}`);

    return new Response(JSON.stringify({
      roomId,
      roomWebSocketPath
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private generateRoomId(): string {
    return 'room_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  }
}