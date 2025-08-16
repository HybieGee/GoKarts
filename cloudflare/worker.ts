// GoKarts Multiplayer Worker - Entry Point
import { MatchmakerDO } from './do/matchmaker';
import { RoomRegistryDO } from './do/registry';
import { RoomDO } from './do/room';

export { MatchmakerDO, RoomRegistryDO, RoomDO };

interface Env {
  MATCHMAKER: DurableObjectNamespace;
  ROOM_REGISTRY: DurableObjectNamespace;
  ROOM_DO: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
  ROOM_SIZE?: string;
  QUEUE_TTL_MS?: string;
  ROOM_HEARTBEAT_MS?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // CORS headers - dynamically set origin
    const origin = request.headers.get('Origin');
    const allowedOrigins = (env.ALLOWED_ORIGINS || '*').split(',');
    const allowOrigin = allowedOrigins.includes(origin || '') ? origin : (env.ALLOWED_ORIGINS ? allowedOrigins[0] : '*');
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }
    
    // Handle REST API endpoints
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      // Queue join endpoint
      if (url.pathname === '/api/queue/join' && request.method === 'POST') {
        const { playerId } = await request.json() as { playerId: string };
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        const response = await matchmaker.fetch(new Request('https://dummy-url/join', {
          method: 'POST',
          body: JSON.stringify({ playerId }),
          headers: { 'Content-Type': 'application/json' }
        }));
        const result = await response.json();
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Queue cancel endpoint
      if (url.pathname === '/api/queue/cancel' && request.method === 'POST') {
        const { playerId } = await request.json() as { playerId: string };
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        await matchmaker.fetch(new Request('https://dummy-url/cancel', {
          method: 'POST',
          body: JSON.stringify({ playerId }),
          headers: { 'Content-Type': 'application/json' }
        }));
        return new Response(JSON.stringify({ status: "cancelled" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Queue poll endpoint
      if (url.pathname === '/api/queue/poll' && request.method === 'GET') {
        const playerId = url.searchParams.get('playerId');
        if (!playerId) {
          return new Response(JSON.stringify({ error: 'Missing playerId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
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
      
      // Debug state endpoint (dev-only)
      if (url.pathname === '/api/debug/state' && request.method === 'GET') {
        // Only allow in non-production environments
        if (env.ENVIRONMENT === 'production') {
          return new Response('Not Found', { status: 404, headers: corsHeaders });
        }
        
        const matchmakerId = env.MATCHMAKER.idFromName('global-matchmaker');
        const matchmaker = env.MATCHMAKER.get(matchmakerId);
        const response = await matchmaker.fetch(new Request('https://dummy-url/debug', {
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
      // WebSocket routing - /ws/room/:roomId
      if (url.pathname.startsWith('/ws/room/')) {
        const roomId = url.pathname.split('/')[3];
        if (!roomId) {
          return new Response('Invalid room ID', { status: 400, headers: corsHeaders });
        }
        const roomDOId = env.ROOM_DO.idFromName(roomId);
        const roomDO = env.ROOM_DO.get(roomDOId);
        return roomDO.fetch(request);
      }
      
      return new Response('WebSocket endpoint not found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error('WebSocket routing error:', error);
      return new Response('WebSocket connection failed: ' + (error as Error).message, { 
        status: 500,
        headers: corsHeaders
      });
    }
  },
};