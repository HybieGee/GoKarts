# 🏎️ GoKarts Multiplayer Setup Guide

## Current Status
- ✅ **Offline Mode**: Works on Vercel with AI opponents
- ❌ **Multiplayer**: Requires Node.js server (not available on Vercel static hosting)

## 🔧 Quick Fixes Applied

### Speed Balance Fixed ✅
- **Human player**: Max speed reduced from 6 to 4
- **AI players**: Max speed increased from 3-3.5 to 3.5-4.5
- **Result**: More balanced and competitive races

### Error Handling ✅
- Fixed Socket.io loading error on static hosting
- Graceful fallback to offline mode
- Connection status indicator shows "🔴 Offline (AI Mode)"

## 🎮 For Local Multiplayer Testing

### Step 1: Run the Server Locally
```bash
# In the GoKarts folder
npm install
npm start
```

### Step 2: Access the Game
- **Local**: http://localhost:3000
- **Network**: http://YOUR_IP:3000 (for friends on same network)

### Step 3: Test Multiplayer
1. Open multiple browser tabs to http://localhost:3000
2. Each tab should show "🟢 Online"
3. Click "START RACING" in each tab
4. Should see "Race starting with X players" in console

### Step 4: Debug Issues
- Visit http://localhost:3000/debug.html for testing tools
- Check browser console (F12) for error messages
- Server terminal should show connection logs

## 🌐 For True Multiplayer Hosting

Since Vercel only supports static hosting, you need a Node.js hosting service:

### Option 1: Railway (Recommended)
1. Sign up at https://railway.app
2. Connect GitHub repository
3. Deploy automatically
4. Get URL like: https://gokarts-production.up.railway.app

### Option 2: Render
1. Sign up at https://render.com
2. Connect GitHub repository  
3. Choose "Web Service"
4. Build command: `npm install`
5. Start command: `npm start`

### Option 3: Heroku
1. Install Heroku CLI
2. `heroku create gokarts-racing`
3. `git push heroku main`

### Option 4: DigitalOcean/Linode
- Rent a VPS ($5/month)
- Install Node.js
- Run the server

## 🚨 Current Vercel Limitations

**What Works:**
- ✅ Offline racing with AI
- ✅ Visual game experience
- ✅ Local leaderboard
- ✅ All UI features

**What Doesn't Work:**
- ❌ Real multiplayer (no Node.js server)
- ❌ Global leaderboard (no database)
- ❌ Real-time position sync
- ❌ Cross-player racing

## 💡 Immediate Solutions

### For You (Game Owner):
1. **Test locally**: Run `npm start` and test on localhost:3000
2. **Deploy properly**: Use Railway/Render for true multiplayer
3. **Update friends**: Give them the proper server URL

### For Now (Vercel):
- Game works in "AI Mode"
- Balanced AI opponents (3.5-4.5 speed vs your 4.0)
- Local leaderboard still tracks wins
- Still fun to play!

## 🔍 Debugging Your Issues

**Issue: Speed difference with friend**
- **Cause**: You're both on Vercel (no real multiplayer)
- **Fix**: Set up proper Node.js hosting

**Issue: No bot movement** 
- **Fixed**: Speed balancing improved
- **Result**: AI should be more competitive now

**Issue: Connection errors**
- **Cause**: Vercel can't serve Socket.io
- **Fix**: Graceful fallback to offline mode

## ⚡ Quick Test
Try the game now on Vercel - you should see:
- 🔴 Offline (AI Mode) status
- More competitive AI opponents
- No Socket.io errors
- Smooth single-player experience

For true multiplayer, we need proper Node.js hosting! 🚀