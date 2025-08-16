# 🏎️ GoKarts Racing - Multiplayer Crypto Racing Game

A real-time multiplayer racing game built for the crypto community, launching on Solana with Pump.fun integration.

## 🎮 Features

- 🏁 **Real-time multiplayer racing** - Race against up to 5 players
- 🎯 **Precision checkpoint system** - Fair racing with validated checkpoints  
- 🏆 **Global leaderboards** - Track wins across all players
- ⛽ **Gas fee rewards** - Top players get gas fees covered every 30 minutes
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

- **Express.js** server with Socket.io for real-time communication
- **Room-based matchmaking** - automatically matches 2-5 players
- **Global leaderboard** with persistent JSON storage
- **20 FPS position synchronization** for smooth gameplay
- **Server-side validation** for anti-cheat protection
- **Fallback offline mode** when server unavailable

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
