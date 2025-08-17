# 🏎️ Grok Karts Online - Multiplayer Crypto Racing Game

A real-time multiplayer racing game built for the crypto community, launching on Solana with Pump.fun integration.

## 🎮 Features

- 🏁 **Real-time multiplayer racing** - Race against up to 5 players
- 🎯 **Precision checkpoint system** - Fair racing with validated checkpoints  
- 🏆 **Global leaderboards** - Track wins across all players
- 🗺️ **Dynamic maps** - New racing tracks every 30 minutes
- 💎 **Pump.fun integration** - Easy token purchasing
- 📱 **Mobile responsive** - Play on any device

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure the game in `config.js`:
```javascript
const GAME_CONFIG = {
    CONTRACT_ADDRESS: "YOUR_PUMP_FUN_ADDRESS",
    BUY_BUTTON: {
        url: "https://pump.fun/YOUR_TOKEN_ADDRESS"
    }
    // ... other settings
};
```

### Running the Game

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000`

## 🏁 How to Play

1. Enter your player name when prompted
2. Click **START RACING** to find a match
3. Wait for other players to join (2-5 players per race)
4. Use **WASD** or **Arrow Keys** to control your kart:
   - **W/↑**: Accelerate
   - **S/↓**: Brake/Reverse
   - **A/←**: Turn Left
   - **D/→**: Turn Right
5. Complete 3 laps through all checkpoints to win!
6. Winners get added to the global leaderboard

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js, Socket.io
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Graphics**: HTML5 Canvas 2D with collision detection
- **Storage**: JSON file storage (leaderboard.json)
- **Deployment**: Supports Heroku, Vercel, Docker

## 🔧 Development

### Project Structure
```
├── server.js            # Multiplayer server
├── package.json         # Dependencies and scripts
├── index.html          # Main game page
├── styles.css          # Game styling with glassmorphism
├── game.js             # Core game logic + multiplayer
├── config.js           # Game configuration
├── Player (1-5).png    # Player kart sprites
├── Map.png             # Race track image
├── leaderboard.json    # Global leaderboard storage
└── README.md           # This file
```

## 🌐 Multiplayer Architecture

- **Cloudflare Workers** with **Durable Objects** for scalable real-time communication
- **REST + WebSocket** hybrid API for queue management and room coordination
- **Authoritative matchmaking** with proper queue management and timeouts
- **Room-based matches** - automatically groups 2-5 players with AI bots
- **Global leaderboard** with persistent JSON storage
- **Fallback offline mode** when server unavailable

## 🚀 Multiplayer Quickstart

### Environment Variables

Configure these environment variables in your deployment:

```bash
# Room Configuration
ROOM_SIZE=5                    # Production: 5 players, Dev: 2 players
QUEUE_TTL_MS=20000            # 20s queue timeout
ROOM_HEARTBEAT_MS=30000       # 30s room heartbeat timeout

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=https://go-karts.vercel.app,https://*.vercel.app,https://grokkarts.online

# Environment
ENVIRONMENT=development        # Use 'production' to disable debug endpoints
```

### Local Development Setup

1. **Start the Cloudflare Worker (Backend)**:
```bash
cd cloudflare
wrangler dev --env dev
# This starts the worker with ROOM_SIZE=2 for easier testing
```

2. **Start the Frontend (in a separate terminal)**:
```bash
# If using Vite
npm run dev

# Or serve the HTML files directly
python -m http.server 8000
# Then open http://localhost:8000
```

3. **Update Frontend URL**: In `websocket-client.js`, update the base URL:
```javascript
const baseUrl = 'http://localhost:8787'; // Wrangler dev default
```

### Acceptance Tests

Run these six tests to verify the multiplayer system works:

1. **Two-Browser Match (ROOM_SIZE=2)**:
   - Open two different browsers
   - Both click "Find Race"
   - Within 3s: queue → matched → WebSocket connected → START countdown

2. **Cancel Works**:
   - One client joins queue
   - Click "Cancel" while queued
   - Server removes entry, second client updates position

3. **Timeout Cleanup (20s)**:
   - Join queue, then leave browser idle
   - After 20s: client removed, UI shows "Timed out"

4. **Room Disconnect**:
   - Get matched into room, close one browser tab
   - Other client receives PEER_LEAVE message

5. **No Duplicates**:
   - Rapidly click "Find Race" multiple times
   - Only one queue entry exists per playerId (idempotent)

6. **CORS**:
   - Test from deployed Vercel site and custom domain
   - All endpoints work without CORS errors

### Debug Tools

Access debug information (dev-only):
```bash
curl http://localhost:8787/api/debug/state
```

Returns:
```json
{
  "queueCount": 2,
  "queuedPlayers": ["player1", "player2"],
  "roomSize": 2,
  "ttlMs": 20000
}
```

### Log Monitoring

All log lines use greppable prefixes for easy debugging:

```bash
# Monitor matchmaking
grep "MM:" worker-logs.txt

# Monitor room events  
grep "ROOM:" worker-logs.txt

# Find specific player activity
grep "player=abc123" worker-logs.txt
```

**Log Examples**:
- `MM:ENQUEUE player=abc123 queueSize=2`
- `MM:MATCH room=room_xyz size=2 players=abc123,def456`
- `ROOM:JOIN room=room_xyz player=abc123 members=2/5`
- `ROOM:START room=room_xyz players=2 countdown=3`

### Deployment

1. **Deploy Worker**:
```bash
wrangler deploy --env production
```

2. **Update Frontend**: Point to production worker URL in `websocket-client.js`

3. **Verify**: Run acceptance tests against production endpoints

## 🎯 Game Features

### Checkpoint System
- 10 precisely positioned checkpoints around the track
- Must pass through all checkpoints in order for valid laps
- Visual indicators show next checkpoint and progress

### Rewards System  
- Top leaderboard player receives gas fee rewards every 30 minutes
- Rewards come from token treasury with verifiable on-chain transactions
- Automatic distribution system (configurable)

## 🎨 Assets

Player models are custom-designed kart sprites located in the root directory:
- `Player (1).png` - Player 1 (You)
- `Player (2).png` - Player 2 (AI)
- `Player (3).png` - Player 3 (AI)
- `Player (4).png` - Player 4 (AI)
- `Player (5).png` - Player 5 (AI)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🏆 Credits

Created with ❤️ by the GoKarts team

---

**Ready to race? Let's go!** 🏁
