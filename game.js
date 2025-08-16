// GoKarts Racing Game
class GoKartsGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentScreen = 'mainMenu';
        this.gameState = 'menu'; // menu, waiting, racing, results
        
        // Multiplayer
        this.socket = null;
        this.isMultiplayer = false;
        this.roomData = null;
        this.playerId = null;
        this.playerName = null;
        
        // Player assets
        this.playerImages = [];
        this.loadPlayerAssets();
        
        // Track image
        this.trackImage = new Image();
        this.trackImageCanvas = null;
        this.trackImageData = null;
        this.trackImage.onload = () => {
            console.log('Track image loaded successfully');
            // Create a canvas to read pixel data for collision detection
            this.trackImageCanvas = document.createElement('canvas');
            this.trackImageCanvas.width = this.trackImage.width;
            this.trackImageCanvas.height = this.trackImage.height;
            const ctx = this.trackImageCanvas.getContext('2d');
            ctx.drawImage(this.trackImage, 0, 0);
            this.trackImageData = ctx.getImageData(0, 0, this.trackImage.width, this.trackImage.height);
        };
        this.trackImage.onerror = () => {
            console.log('Could not load track image, using fallback design');
        };
        // Try to load custom track image
        this.trackImage.src = 'Map.png';
        
        // Game data
        this.players = [];
        this.localPlayer = null;
        this.currentLap = 1;
        this.maxLaps = 3;
        this.raceStartTime = 0;
        this.raceFinished = false;
        
        // Checkpoint system
        this.checkpointLines = [
            { p1: { x: 0.62, y: 0.76 }, p2: { x: 0.69, y: 0.91 } },  // CP1
            { p1: { x: 0.41, y: 0.93 }, p2: { x: 0.44, y: 0.79 } },  // CP2
            { p1: { x: 0.15, y: 0.76 }, p2: { x: 0.24, y: 0.66 } },  // CP3
            { p1: { x: 0.06, y: 0.37 }, p2: { x: 0.17, y: 0.39 } },  // CP4
            { p1: { x: 0.26, y: 0.11 }, p2: { x: 0.27, y: 0.24 } },  // CP5
            { p1: { x: 0.33, y: 0.32 }, p2: { x: 0.44, y: 0.34 } },  // CP6
            { p1: { x: 0.43, y: 0.51 }, p2: { x: 0.34, y: 0.63 } },  // CP7
            { p1: { x: 0.53, y: 0.48 }, p2: { x: 0.62, y: 0.57 } },  // CP8
            { p1: { x: 0.59, y: 0.20 }, p2: { x: 0.67, y: 0.32 } },  // CP9
            { p1: { x: 0.76, y: 0.28 }, p2: { x: 0.84, y: 0.14 } }   // CP10
        ];
        
        // Start/finish line (proper line across track for lap detection)
        this.startFinishLine = { p1: { x: 0.763, y: 0.463 }, p2: { x: 0.862, y: 0.572 } };
        
        
        // Leaderboard data (stored locally for now)
        this.leaderboard = this.loadLeaderboard();
        
        // Controls
        this.keys = {};
        
        
        this.initializeEventListeners();
        this.populateLandingPage();
        this.initializeMultiplayer();
        this.showScreen('mainMenu');
        
        
    }
    
    initializeMultiplayer() {
        // Connect to multiplayer server
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host || 'localhost:3000';
        
        console.log(`🌐 Attempting to connect to multiplayer server at ${host}`);
        
        // Try Cloudflare Workers first, then Socket.io, then offline
        if (typeof createCloudflareClient !== 'undefined') {
            console.log('🚀 Trying Cloudflare Workers connection...');
            this.socket = createCloudflareClient();
            this.socket.connect('wss://gokarts-multiplayer.your-subdomain.workers.dev');
            this.setupMultiplayerEvents();
        } else if (typeof io !== 'undefined') {
            console.log('📡 Trying Socket.io connection...');
            this.socket = io();
            this.setupMultiplayerEvents();
        } else {
            console.log('⚠️ Running in offline mode (no multiplayer server available)');
            console.log('🎮 You can still play with AI opponents!');
            this.isMultiplayer = false;
            this.updateConnectionStatus(false);
        }
    }
    
    setupMultiplayerEvents() {
        if (!this.socket) return;
        
        this.socket.on('connect', () => {
            console.log(`✅ Connected to multiplayer server! Player ID: ${this.socket.id}`);
            this.playerId = this.socket.id;
            this.isMultiplayer = true;
            this.updateConnectionStatus(true);
            
            // Get player name
            this.requestPlayerName();
        });
        
        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            this.isMultiplayer = false;
            this.updateConnectionStatus(false);
            // Show user they're offline
            if (this.currentScreen === 'waitingScreen') {
                this.showScreen('mainMenu');
                alert('Lost connection to server. Please refresh and try again.');
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ Connection error:', error);
            this.isMultiplayer = false;
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('room-update', (data) => {
            this.roomData = data;
            this.updateWaitingScreen(data);
        });
        
        this.socket.on('race-start', (data) => {
            console.log(`🏁 Race starting with ${data.players.length} players:`, data.players);
            this.startMultiplayerRace(data);
        });
        
        this.socket.on('player-position', (data) => {
            // Debug: Log bot positions occasionally
            if (data.playerId.startsWith('bot_') && Math.random() < 0.01) {
                console.log('🤖 Bot position update:', data.playerId, data.x, data.y);
            }
            this.updateRemotePlayerPosition(data);
        });
        
        this.socket.on('race-end', (data) => {
            console.log('🏆 Race ended, winner:', data.winner);
            this.handleRaceEnd(data);
        });
        
        this.socket.on('leaderboard-data', (data) => {
            this.updateGlobalLeaderboard(data);
        });
        
        this.socket.on('matchmaking-error', (error) => {
            console.error('Matchmaking error:', error);
            alert('Could not find a race. Please try again.');
            this.showScreen('mainMenu');
        });
    }
    
    requestPlayerName() {
        // Check if we have a saved name
        let savedName = localStorage.getItem('gokarts_player_name');
        
        if (!savedName) {
            savedName = prompt('Enter your player name:') || `Player_${Date.now().toString().slice(-6)}`;
            localStorage.setItem('gokarts_player_name', savedName);
        }
        
        this.playerName = savedName;
        
        // Identify to server
        if (this.socket) {
            this.socket.emit('player-identify', {
                name: this.playerName,
                wallet: null // TODO: Add wallet connection
            });
        }
    }
    
    updateWaitingScreen(roomData) {
        if (this.currentScreen === 'waitingScreen') {
            const waitingText = document.querySelector('#waitingScreen p');
            if (waitingText) {
                waitingText.textContent = `Waiting for players (${roomData.playersCount}/${roomData.maxPlayers})`;
            }
            
            // Show player list
            const playerListDiv = document.getElementById('playerList');
            if (!playerListDiv) {
                const container = document.querySelector('#waitingScreen .screen-container');
                const newPlayerList = document.createElement('div');
                newPlayerList.id = 'playerList';
                newPlayerList.innerHTML = '<h3>Players in Room:</h3>';
                container.insertBefore(newPlayerList, container.querySelector('button'));
            }
            
            const playerList = document.getElementById('playerList');
            playerList.innerHTML = '<h3>Players in Room:</h3>' + 
                roomData.players.map(p => `<p>• ${p.name}</p>`).join('');
        }
    }
    
    startMultiplayerRace(data) {
        this.showScreen('gameScreen');
        this.gameState = 'racing';
        this.raceStartTime = data.startTime;
        
        // Initialize players
        this.players = [];
        data.players.forEach((playerData, index) => {
            const isLocal = playerData.id === this.playerId;
            const canvasWidth = this.canvas.width || 1200;
            const canvasHeight = this.canvas.height || 800;
            
            const player = {
                id: playerData.id,
                name: playerData.name,
                x: canvasWidth * playerData.position.x,
                y: canvasHeight * playerData.position.y,
                angle: playerData.position.angle,
                velocity: { x: 0, y: 0 },
                speed: 0,
                maxSpeed: isLocal ? 6 : 3.5,
                acceleration: isLocal ? 0.4 : 0.3,
                deceleration: 0.6,
                friction: 0.85,
                turnSpeed: 0.08,
                lapCount: 1,
                position: index + 1,
                isLocal: isLocal,
                isBot: playerData.isBot || false,
                image: this.playerImages[index % this.playerImages.length],
                nextCheckpoint: 0,
                checkpointsPassed: [],
                prevX: canvasWidth * playerData.position.x,
                prevY: canvasHeight * playerData.position.y,
                lapStarted: false,
                lastCrossTime: 0
            };
            
            this.players.push(player);
            if (isLocal) {
                this.localPlayer = player;
            }
        });
        
        this.raceFinished = false;
        this.gameLoop();
    }
    
    updateRemotePlayerPosition(data) {
        const player = this.players.find(p => p.id === data.playerId);
        if (player && !player.isLocal) {
            const canvasWidth = this.canvas.width || 1200;
            const canvasHeight = this.canvas.height || 800;
            
            // Target positions from server
            const targetX = canvasWidth * data.x;
            const targetY = canvasHeight * data.y;
            
            // Smooth interpolation for better movement
            const lerpFactor = 0.3; // Adjust for smoothness vs responsiveness
            player.x = player.x + (targetX - player.x) * lerpFactor;
            player.y = player.y + (targetY - player.y) * lerpFactor;
            
            // Angle interpolation
            let targetAngle = data.angle;
            let angleDiff = targetAngle - player.angle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            player.angle += angleDiff * 0.3;
            
            // Update game state
            player.lapCount = data.lapCount;
            player.nextCheckpoint = data.nextCheckpoint;
            player.speed = data.speed || 0;
        }
    }
    
    sendPlayerUpdate() {
        if (this.socket && this.localPlayer && this.gameState === 'racing') {
            const canvasWidth = this.canvas.width || 1200;
            const canvasHeight = this.canvas.height || 800;
            
            this.socket.emit('player-update', {
                x: this.localPlayer.x / canvasWidth,
                y: this.localPlayer.y / canvasHeight,
                angle: this.localPlayer.angle,
                lapCount: this.localPlayer.lapCount,
                nextCheckpoint: this.localPlayer.nextCheckpoint,
                speed: this.localPlayer.speed
            });
        }
    }
    
    handleRaceEnd(data) {
        this.raceFinished = true;
        this.gameState = 'results';
        
        setTimeout(() => {
            this.showMultiplayerResults(data);
        }, 1000);
    }
    
    showMultiplayerResults(data) {
        this.showScreen('resultsScreen');
        
        const resultTitle = document.getElementById('raceResult');
        const resultsList = document.getElementById('raceResultsList');
        
        const isWinner = data.winner.id === this.playerId;
        if (isWinner) {
            resultTitle.textContent = '🏆 You Won!';
            resultTitle.style.color = '#ffd700';
        } else {
            const winnerPrefix = data.winner.isBot ? '🤖 ' : '';
            resultTitle.textContent = `🏁 ${winnerPrefix}${data.winner.name} Won!`;
            resultTitle.style.color = data.winner.isBot ? '#ff9500' : '#ff6b6b';
        }
        
        // Display final positions
        resultsList.innerHTML = '';
        data.finalPositions.forEach((player, index) => {
            const entry = document.createElement('div');
            entry.className = 'result-entry';
            if (index === 0) entry.classList.add('winner');
            if (player.id === this.playerId) entry.style.background = 'rgba(76, 236, 196, 0.2)';
            
            const playerName = player.isBot ? `🤖 ${player.name}` : player.name;
            const playerIndicator = player.id === this.playerId ? '(You)' : (player.isBot ? '(Bot)' : '');
            
            entry.innerHTML = `
                <span>${player.position}. ${playerName}</span>
                <span>${playerIndicator}</span>
            `;
            resultsList.appendChild(entry);
        });
        
        // Request updated leaderboard
        if (this.socket) {
            this.socket.emit('get-leaderboard');
        }
    }
    
    updateGlobalLeaderboard(leaderboardData) {
        this.globalLeaderboard = leaderboardData;
        if (this.currentScreen === 'leaderboardScreen') {
            this.updateLeaderboardDisplay();
        }
    }
    
    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            if (isConnected) {
                statusElement.textContent = '🟢 Online';
                statusElement.style.color = '#4ecdc4';
            } else {
                statusElement.textContent = '🔴 Offline (AI Mode)';
                statusElement.style.color = '#ff6b6b';
                statusElement.title = 'Playing with AI opponents only';
            }
        }
    }
    
    populateLandingPage() {
        if (!window.GAME_CONFIG) return;
        
        const config = window.GAME_CONFIG;
        
        // Update branding
        const gameTitle = document.getElementById('gameTitle');
        const gameTagline = document.getElementById('gameTagline');
        const gameDescription = document.getElementById('gameDescription');
        
        if (gameTitle) gameTitle.textContent = config.BRANDING.gameTitle;
        if (gameTagline) gameTagline.textContent = config.BRANDING.tagline;
        if (gameDescription) gameDescription.textContent = config.BRANDING.description;
        
        // Populate features list
        const featuresList = document.getElementById('featuresList');
        if (featuresList && config.FEATURES) {
            featuresList.innerHTML = '';
            config.FEATURES.forEach(feature => {
                const featureItem = document.createElement('div');
                featureItem.className = 'feature-item';
                featureItem.textContent = feature;
                featuresList.appendChild(featureItem);
            });
        }
        
        // Update contract information
        const contractName = document.getElementById('contractName');
        const contractSymbol = document.getElementById('contractSymbol');
        const contractAddress = document.getElementById('contractAddress');
        const networkBadge = document.getElementById('networkBadge');
        
        if (contractName) contractName.textContent = config.CONTRACT_NAME;
        if (contractSymbol) contractSymbol.textContent = config.CONTRACT_SYMBOL;
        if (networkBadge) networkBadge.textContent = config.NETWORK.name;
        
        // Format contract address for display (show first 6 and last 4 characters)
        if (contractAddress) {
            const addr = config.CONTRACT_ADDRESS;
            const displayAddr = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
            contractAddress.textContent = displayAddr;
            contractAddress.setAttribute('data-full-address', addr);
        }
        
        // Populate social links
        const socialLinks = document.getElementById('socialLinks');
        if (socialLinks && config.BRANDING.socials) {
            socialLinks.innerHTML = '';
            const socials = config.BRANDING.socials;
            
            Object.entries(socials).forEach(([platform, url]) => {
                const link = document.createElement('a');
                link.href = url;
                link.target = '_blank';
                link.className = 'social-btn';
                link.setAttribute('aria-label', platform);
                
                // Add appropriate icons
                const icons = {
                    twitter: '🐦',
                    website: '🌐'
                };
                
                link.textContent = icons[platform] || '🔗';
                socialLinks.appendChild(link);
            });
        }
        
        // Set up contract address copying
        this.setupContractActions();
    }
    
    setupContractActions() {
        const copyBtn = document.getElementById('copyAddressBtn');
        const explorerBtn = document.getElementById('viewExplorerBtn');
        const contractAddress = document.getElementById('contractAddress');
        
        if (copyBtn && contractAddress) {
            copyBtn.addEventListener('click', () => {
                const fullAddress = contractAddress.getAttribute('data-full-address');
                if (fullAddress) {
                    navigator.clipboard.writeText(fullAddress).then(() => {
                        copyBtn.textContent = '✅';
                        setTimeout(() => {
                            copyBtn.textContent = '📋';
                        }, 2000);
                    }).catch(() => {
                        // Fallback for older browsers
                        const textArea = document.createElement('textarea');
                        textArea.value = fullAddress;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        
                        copyBtn.textContent = '✅';
                        setTimeout(() => {
                            copyBtn.textContent = '📋';
                        }, 2000);
                    });
                }
            });
        }
        
        if (explorerBtn && window.GAME_CONFIG && window.GAME_CONFIG.BUY_BUTTON.enabled) {
            // Update button text
            explorerBtn.textContent = window.GAME_CONFIG.BUY_BUTTON.text;
            
            explorerBtn.addEventListener('click', () => {
                window.open(window.GAME_CONFIG.BUY_BUTTON.url, '_blank');
            });
        }
    }
    
    loadPlayerAssets() {
        const playerPaths = [
            'Player (1).png',
            'Player (2).png',
            'Player (3).png',
            'Player (4).png',
            'Player (5).png'
        ];
        
        playerPaths.forEach((path, index) => {
            const img = new Image();
            img.onload = () => {
                console.log(`Loaded player asset ${index + 1}`);
            };
            img.onerror = () => {
                console.log(`Could not load ${path}, using placeholder`);
                // Create a simple colored rectangle as fallback
                const canvas = document.createElement('canvas');
                canvas.width = 40;
                canvas.height = 60;
                const ctx = canvas.getContext('2d');
                const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#fecca7'];
                ctx.fillStyle = colors[index];
                ctx.fillRect(0, 0, 40, 60);
                img.src = canvas.toDataURL();
            };
            img.src = path;
            this.playerImages.push(img);
        });
    }
    
    initializeEventListeners() {
        // Menu navigation
        document.getElementById('playBtn').addEventListener('click', () => this.startMatchmaking());
        document.getElementById('leaderboardBtn').addEventListener('click', () => this.showLeaderboard());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettings());
        document.getElementById('backFromLeaderboard').addEventListener('click', () => this.showScreen('mainMenu'));
        document.getElementById('cancelWaiting').addEventListener('click', () => this.cancelMatchmaking());
        document.getElementById('playAgainBtn').addEventListener('click', () => this.startMatchmaking());
        document.getElementById('backToMenuBtn').addEventListener('click', () => this.showScreen('mainMenu'));
        
        // Add about button handler
        const aboutBtn = document.getElementById('aboutBtn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', () => this.showAbout());
        }
        
        // Add modal close handler
        const closeAboutModal = document.getElementById('closeAboutModal');
        if (closeAboutModal) {
            closeAboutModal.addEventListener('click', () => this.closeAbout());
        }
        
        // Close modal when clicking outside
        const aboutModal = document.getElementById('aboutModal');
        if (aboutModal) {
            aboutModal.addEventListener('click', (e) => {
                if (e.target === aboutModal) {
                    this.closeAbout();
                }
            });
        }
        
        // Game controls
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            this.keys[e.code] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.keys[e.code] = false;
        });
    }
    
    showScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        // Show target screen
        document.getElementById(screenName).classList.add('active');
        this.currentScreen = screenName;
        
        // Update screen-specific content
        if (screenName === 'leaderboardScreen') {
            this.updateLeaderboardDisplay();
        }
    }
    
    startMatchmaking() {
        this.showScreen('waitingScreen');
        this.gameState = 'waiting';
        
        if (this.isMultiplayer && this.socket) {
            // Join multiplayer matchmaking
            this.socket.emit('find-match');
        } else {
            // Fallback to single player mode
            console.log('Starting offline race...');
            setTimeout(() => {
                this.startRace();
            }, 2000);
        }
    }
    
    cancelMatchmaking() {
        if (this.socket) {
            this.socket.emit('leave-room');
        }
        this.showScreen('mainMenu');
        this.gameState = 'menu';
    }
    
    startRace() {
        this.showScreen('gameScreen');
        this.gameState = 'racing';
        
        // Give the screen time to be visible before initializing
        setTimeout(() => {
            this.initializeRace();
            this.gameLoop();
        }, 100);
    }
    
    initializeRace() {
        // Create 5 players (including local player)
        this.players = [];
        
        // All players start at the same position behind the start line (with fallback canvas dimensions)
        const canvasWidth = this.canvas.width || 1200;
        const canvasHeight = this.canvas.height || 800;
        const startPosition = { x: canvasWidth * 0.80, y: canvasHeight * 0.50 };
        
        // Calculate starting angle to face (0.72, 0.68)
        const targetX = canvasWidth * 0.72;
        const targetY = canvasHeight * 0.68;
        const startAngle = Math.atan2(targetX - startPosition.x, -(targetY - startPosition.y));
        
        // Local player (always player 1)
        this.localPlayer = {
            id: 1,
            name: 'You',
            x: startPosition.x,
            y: startPosition.y,
            angle: startAngle, // Face towards (0.72, 0.68)
            velocity: { x: 0, y: 0 },
            speed: 0,
            maxSpeed: 4, // Reduced from 6 to balance with AI
            acceleration: 0.3,
            deceleration: 0.6,
            friction: 0.85,
            turnSpeed: 0.08,
            lapCount: 1,
            position: 1,
            isLocal: true,
            image: this.playerImages[0],
            nextCheckpoint: 0,
            checkpointsPassed: [],
            prevX: startPosition.x,
            prevY: startPosition.y,
            lapStarted: false,
            lastCrossTime: 0,
        };
        this.players.push(this.localPlayer);
        
        // AI players
        for (let i = 1; i < 5; i++) {
            this.players.push({
                id: i + 1,
                name: `Player ${i + 1}`,
                x: startPosition.x,
                y: startPosition.y,
                angle: startAngle,
                velocity: { x: 0, y: 0 },
                speed: 0,
                maxSpeed: 3.5 + Math.random() * 1, // Increased from 3-3.5 to 3.5-4.5
                acceleration: 0.25 + Math.random() * 0.1,
                deceleration: 0.5,
                friction: 0.85,
                turnSpeed: 0.06 + Math.random() * 0.02,
                lapCount: 1,
                position: i + 1,
                isLocal: false,
                image: this.playerImages[i],
                aiTarget: { x: 300, y: 150 }, // First turn target
                nextCheckpoint: 0,
                checkpointsPassed: [],
                prevX: startPosition.x,
                prevY: startPosition.y,
                lapStarted: false,
                lastCrossTime: 0,
            });
        }
        
        this.raceStartTime = Date.now();
        this.raceFinished = false;
    }
    
    gameLoop() {
        if (this.gameState === 'racing') {
            this.update();
            this.render();
            requestAnimationFrame(() => this.gameLoop());
        }
    }
    
    update() {
        // Update local player
        this.updatePlayer(this.localPlayer);
        
        // Update AI players (only in offline mode)
        if (!this.isMultiplayer) {
            this.players.forEach(player => {
                if (!player.isLocal) {
                    this.updateAIPlayer(player);
                }
            });
        }
        
        // Update checkpoints
        this.updateCheckpoints();
        
        // Update race positions
        this.updateRacePositions();
        
        // Send position updates to server (throttled)
        if (this.isMultiplayer) {
            if (!this.lastUpdateSent || Date.now() - this.lastUpdateSent > 50) { // 20 FPS updates
                this.sendPlayerUpdate();
                this.lastUpdateSent = Date.now();
            }
        }
        
        // Update UI
        this.updateRaceUI();
    }
    
    updatePlayer(player) {
        if (player.isLocal) {
            // Handle local player input - relative to kart's front
            let accelerating = false;
            let braking = false;
            
            // W/S controls speed (forward/backward relative to kart's front)
            if (this.keys['w'] || this.keys['ArrowUp']) {
                player.speed += player.acceleration;
                accelerating = true;
            } else if (this.keys['s'] || this.keys['ArrowDown']) {
                player.speed -= player.deceleration;
                braking = true;
            }
            
            // A/D controls turning (only when moving)
            if (Math.abs(player.speed) > 0.1) {
                if (this.keys['a'] || this.keys['ArrowLeft']) {
                    player.angle -= player.turnSpeed * Math.abs(player.speed) / player.maxSpeed;
                }
                if (this.keys['d'] || this.keys['ArrowRight']) {
                    player.angle += player.turnSpeed * Math.abs(player.speed) / player.maxSpeed;
                }
            }
            
            // Speed limits
            player.speed = Math.max(-player.maxSpeed * 0.6, Math.min(player.maxSpeed, player.speed));
            
            // Apply friction when not accelerating
            if (!accelerating && !braking) {
                player.speed *= player.friction;
                if (Math.abs(player.speed) < 0.1) {
                    player.speed = 0;
                }
            }
        }
        
        // Move in the direction the kart is facing 
        // Start with kart facing upward (negative Y direction)
        player.velocity.x = Math.sin(player.angle) * player.speed;
        player.velocity.y = -Math.cos(player.angle) * player.speed;
        
        // Update position
        // Calculate new position and check collision
        const newX = player.x + player.velocity.x;
        const newY = player.y + player.velocity.y;
        
        // Check if new position is on track
        if (this.isOnTrack(newX, newY)) {
            player.x = newX;
            player.y = newY;
        } else {
            // If hit wall, reduce speed significantly
            player.speed *= 0.3;
        }
        
        // Keep player on screen
        const canvasWidth = this.canvas.width || 1200;
        const canvasHeight = this.canvas.height || 800;
        player.x = Math.max(30, Math.min(canvasWidth - 30, player.x));
        player.y = Math.max(30, Math.min(canvasHeight - 30, player.y));
    }
    
    updateAIPlayer(player) {
        // Simple AI: move towards target, then create new random target
        const dx = player.aiTarget.x - player.x;
        const dy = player.aiTarget.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) {
            // Create new random target
            const canvasWidth = this.canvas.width || 1200;
            const canvasHeight = this.canvas.height || 800;
            player.aiTarget = {
                x: Math.random() * (canvasWidth - 100) + 50,
                y: Math.random() * (canvasHeight - 100) + 50
            };
        }
        
        // Calculate angle to target
        const targetAngle = Math.atan2(dy, dx);
        const angleDiff = targetAngle - player.angle;
        
        // Normalize angle difference
        const normalizedAngleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
        
        // Turn towards target
        if (Math.abs(normalizedAngleDiff) > 0.1) {
            player.angle += Math.sign(normalizedAngleDiff) * player.turnSpeed * 2;
        }
        
        // Move forward
        player.speed = Math.min(player.speed + player.acceleration, player.maxSpeed);
    }
    
    updateCheckpoints() {
        const now = Date.now();
        
        this.players.forEach(player => {
            // Skip if cooldown hasn't expired (prevent double triggers)
            if (now - player.lastCrossTime < 150) {
                player.prevX = player.x;
                player.prevY = player.y;
                return;
            }
            
            // Create movement segment from previous to current position
            const movementSegment = {
                p1: { x: player.prevX, y: player.prevY },
                p2: { x: player.x, y: player.y }
            };
            
            // Convert start/finish line to canvas coordinates
            const canvasWidth = this.canvas.width || 1200;
            const canvasHeight = this.canvas.height || 800;
            const sfLine = {
                p1: { x: this.startFinishLine.p1.x * canvasWidth, 
                     y: this.startFinishLine.p1.y * canvasHeight },
                p2: { x: this.startFinishLine.p2.x * canvasWidth,
                     y: this.startFinishLine.p2.y * canvasHeight }
            };
            
            // Check start/finish line crossing
            if (this.segmentsIntersect(movementSegment.p1, movementSegment.p2, sfLine.p1, sfLine.p2)) {
                if (!player.lapStarted) {
                    // First time crossing S/F - start the lap
                    player.lapStarted = true;
                    player.nextCheckpoint = 0;
                    player.checkpointsPassed = [];
                } else if (player.nextCheckpoint === this.checkpointLines.length) {
                    // Completed all checkpoints - valid lap!
                    player.lapCount++;
                    player.nextCheckpoint = 0;
                    player.checkpointsPassed = [];
                    player.lastCrossTime = now;
                    
                    if (player.lapCount > this.maxLaps && !this.raceFinished) {
                        this.finishRace(player);
                    }
                }
            }
            
            // Check next checkpoint crossing
            if (player.lapStarted && player.nextCheckpoint < this.checkpointLines.length) {
                const checkpoint = this.checkpointLines[player.nextCheckpoint];
                const cpLine = {
                    p1: { x: checkpoint.p1.x * canvasWidth,
                         y: checkpoint.p1.y * canvasHeight },
                    p2: { x: checkpoint.p2.x * canvasWidth,
                         y: checkpoint.p2.y * canvasHeight }
                };
                
                if (this.segmentsIntersect(movementSegment.p1, movementSegment.p2, cpLine.p1, cpLine.p2)) {
                    player.checkpointsPassed.push(player.nextCheckpoint);
                    player.nextCheckpoint++;
                    player.lastCrossTime = now;
                }
            }
            
            // Update previous position for next frame
            player.prevX = player.x;
            player.prevY = player.y;
        });
    }
    
    segmentsIntersect(a1, a2, b1, b2) {
        // Check if two line segments intersect
        const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
        
        const d1 = cross(a1, a2, b1);
        const d2 = cross(a1, a2, b2);
        const d3 = cross(b1, b2, a1);
        const d4 = cross(b1, b2, a2);
        
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && 
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }
        
        // Handle collinear cases
        const onSegment = (p, q, r) => {
            return Math.min(p.x, r.x) <= q.x && q.x <= Math.max(p.x, r.x) &&
                   Math.min(p.y, r.y) <= q.y && q.y <= Math.max(p.y, r.y);
        };
        
        if (Math.abs(d1) < 1e-6 && onSegment(a1, b1, a2)) return true;
        if (Math.abs(d2) < 1e-6 && onSegment(a1, b2, a2)) return true;
        if (Math.abs(d3) < 1e-6 && onSegment(b1, a1, b2)) return true;
        if (Math.abs(d4) < 1e-6 && onSegment(b1, a2, b2)) return true;
        
        return false;
    }
    
    updateRacePositions() {
        // Calculate position based on laps and checkpoints
        this.players.forEach(player => {
            const lapProgress = player.lapCount - 1;
            const checkpointProgress = player.nextCheckpoint / Math.max(1, this.checkpointLines.length);
            player.raceProgress = lapProgress + checkpointProgress;
        });
        
        // Sort by race progress and assign positions
        const sortedPlayers = [...this.players].sort((a, b) => b.raceProgress - a.raceProgress);
        sortedPlayers.forEach((player, index) => {
            player.position = index + 1;
        });
    }
    
    finishRace(winner) {
        this.raceFinished = true;
        this.gameState = 'results';
        
        // In multiplayer, notify server. In offline, handle locally
        if (this.isMultiplayer && winner.isLocal && this.socket) {
            this.socket.emit('race-finish', {
                playerId: winner.id,
                finalTime: Date.now() - this.raceStartTime,
                lapCount: winner.lapCount
            });
        } else if (!this.isMultiplayer) {
            // Update local leaderboard
            if (winner.isLocal) {
                this.updateLeaderboard(this.playerName || 'You');
            }
            
            // Show results after short delay
            setTimeout(() => {
                this.showRaceResults(winner);
            }, 1000);
        }
    }
    
    showRaceResults(winner) {
        this.showScreen('resultsScreen');
        
        const resultTitle = document.getElementById('raceResult');
        const resultsList = document.getElementById('raceResultsList');
        
        if (winner.isLocal) {
            resultTitle.textContent = '🏆 You Won!';
            resultTitle.style.color = '#ffd700';
        } else {
            resultTitle.textContent = `${winner.name} Won!`;
            resultTitle.style.color = '#ff6b6b';
        }
        
        // Display final positions
        const sortedPlayers = [...this.players].sort((a, b) => a.position - b.position);
        resultsList.innerHTML = '';
        
        sortedPlayers.forEach((player, index) => {
            const entry = document.createElement('div');
            entry.className = 'result-entry';
            if (index === 0) entry.classList.add('winner');
            
            entry.innerHTML = `
                <span>${player.position}. ${player.name}</span>
                <span>Lap ${Math.min(player.lapCount, this.maxLaps)}</span>
            `;
            resultsList.appendChild(entry);
        });
    }
    
    isOnTrack(x, y) {
        // Check if position is on the track (not on grass)
        if (!this.trackImageData) return true; // If no collision data, allow movement
        
        // Convert canvas coordinates to image coordinates
        const imgX = Math.floor((x / this.canvas.width) * this.trackImage.width);
        const imgY = Math.floor((y / this.canvas.height) * this.trackImage.height);
        
        // Bounds check
        if (imgX < 0 || imgX >= this.trackImage.width || imgY < 0 || imgY >= this.trackImage.height) {
            return false;
        }
        
        // Get pixel data (RGBA)
        const pixelIndex = (imgY * this.trackImage.width + imgX) * 4;
        const r = this.trackImageData.data[pixelIndex];
        const g = this.trackImageData.data[pixelIndex + 1];
        const b = this.trackImageData.data[pixelIndex + 2];
        
        // Green grass is roughly RGB(76, 175, 80) - check if it's NOT green
        // Track (dark gray) and borders (red/white) should allow movement
        const isGreen = g > r + 50 && g > b + 50; // Simple green detection
        return !isGreen;
    }
    
    
    
    
    
    updateRaceUI() {
        if (this.localPlayer) {
            document.getElementById('lapCounter').textContent = `Lap: ${Math.min(this.localPlayer.lapCount, this.maxLaps)}/${this.maxLaps}`;
            document.getElementById('position').textContent = `Position: ${this.localPlayer.position}/5`;
            
            const elapsed = Math.floor((Date.now() - this.raceStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            document.getElementById('raceTimer').textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }
    
    render() {
        // Clear canvas with grass background
        this.ctx.fillStyle = '#4a7c59';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw track (custom image or fallback)
        this.drawTrack();
        
        
        // Draw checkpoints
        this.drawCheckpoints();
        
        // Draw players
        this.players.forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    drawTrack() {
        if (this.trackImage && this.trackImage.complete && this.trackImage.naturalWidth > 0) {
            // Draw the Map.png image scaled to canvas
            this.ctx.drawImage(this.trackImage, 0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    
    
    
    drawPlayer(player) {
        this.ctx.save();
        this.ctx.translate(player.x, player.y);
        // Rotate sprite to match movement direction
        this.ctx.rotate(player.angle);
        
        if (player.image && player.image.complete) {
            this.ctx.drawImage(player.image, -20, -30, 40, 60);
        } else {
            // Fallback rectangle - draw pointing upward
            this.ctx.fillStyle = player.isLocal ? '#4ecdc4' : '#ff6b6b';
            this.ctx.fillRect(-15, -20, 30, 40);
            // Add direction indicator
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(-3, -25, 6, 10);
        }
        
        this.ctx.restore();
        
        // Draw player name and position
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        // Add bot indicator
        const nameText = player.isBot ? `🤖 ${player.name} (${player.position})` : `${player.name} (${player.position})`;
        this.ctx.fillText(nameText, player.x, player.y - 40);
    }
    
    drawCheckpoints() {
        const canvasWidth = this.canvas.width || 1200;
        const canvasHeight = this.canvas.height || 800;
        
        // Draw checkpoint lines
        this.checkpointLines.forEach((checkpoint, index) => {
            const p1 = { 
                x: checkpoint.p1.x * canvasWidth,
                y: checkpoint.p1.y * canvasHeight 
            };
            const p2 = { 
                x: checkpoint.p2.x * canvasWidth,
                y: checkpoint.p2.y * canvasHeight 
            };
            
            // Set color based on checkpoint status
            if (this.localPlayer) {
                if (index < this.localPlayer.nextCheckpoint) {
                    this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)'; // Green - passed
                } else if (index === this.localPlayer.nextCheckpoint) {
                    this.ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Yellow - next
                    this.ctx.shadowColor = 'yellow';
                    this.ctx.shadowBlur = 5;
                } else {
                    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)'; // Red - upcoming
                }
            } else {
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
            }
            
            // Draw the checkpoint line
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
        });
        
        // Draw start/finish line
        const sf = {
            p1: { x: this.startFinishLine.p1.x * canvasWidth,
                  y: this.startFinishLine.p1.y * canvasHeight },
            p2: { x: this.startFinishLine.p2.x * canvasWidth,
                  y: this.startFinishLine.p2.y * canvasHeight }
        };
        
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(sf.p1.x, sf.p1.y);
        this.ctx.lineTo(sf.p2.x, sf.p2.y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    showLeaderboard() {
        this.showScreen('leaderboardScreen');
        
        // Request fresh leaderboard data if connected to server
        if (this.socket && this.isMultiplayer) {
            this.socket.emit('get-leaderboard');
        }
    }
    
    updateLeaderboardDisplay() {
        const leaderboardList = document.getElementById('leaderboardList');
        leaderboardList.innerHTML = '';
        
        // Use global leaderboard if available, otherwise local
        const leaderboardData = this.globalLeaderboard || this.leaderboard;
        
        if (leaderboardData.length === 0) {
            leaderboardList.innerHTML = '<p style="text-align: center; padding: 20px;">No races completed yet!</p>';
            return;
        }
        
        // Add header to show if it's global or local leaderboard
        const headerDiv = document.createElement('div');
        headerDiv.style.textAlign = 'center';
        headerDiv.style.padding = '10px';
        headerDiv.style.fontWeight = 'bold';
        headerDiv.style.color = this.globalLeaderboard ? '#4ecdc4' : '#ff6b6b';
        headerDiv.textContent = this.globalLeaderboard ? '🌐 Global Leaderboard' : '📱 Local Leaderboard';
        leaderboardList.appendChild(headerDiv);
        
        leaderboardData.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            if (index === 0) entryDiv.classList.add('top');
            
            // Highlight current player
            const isCurrentPlayer = entry.name === this.playerName;
            if (isCurrentPlayer) {
                entryDiv.style.background = 'rgba(76, 236, 196, 0.2)';
                entryDiv.style.border = '1px solid #4ecdc4';
            }
            
            entryDiv.innerHTML = `
                <span class="leaderboard-rank">${index + 1}</span>
                <span class="leaderboard-name">${entry.name}${isCurrentPlayer ? ' (You)' : ''}</span>
                <span class="leaderboard-wins">${entry.wins} wins</span>
            `;
            leaderboardList.appendChild(entryDiv);
        });
    }
    
    updateLeaderboard(playerName) {
        const existingPlayer = this.leaderboard.find(p => p.name === playerName);
        if (existingPlayer) {
            existingPlayer.wins++;
        } else {
            this.leaderboard.push({ name: playerName, wins: 1 });
        }
        
        // Sort by wins
        this.leaderboard.sort((a, b) => b.wins - a.wins);
        
        // Save to localStorage
        this.saveLeaderboard();
    }
    
    loadLeaderboard() {
        const saved = localStorage.getItem('gokarts_leaderboard');
        return saved ? JSON.parse(saved) : [];
    }
    
    saveLeaderboard() {
        localStorage.setItem('gokarts_leaderboard', JSON.stringify(this.leaderboard));
    }
    
    showSettings() {
        alert('Settings coming soon!');
    }
    
    showAbout() {
        const config = window.GAME_CONFIG;
        if (!config) return;
        
        // Populate modal content
        const aboutTitle = document.getElementById('aboutTitle');
        const aboutDescription = document.getElementById('aboutDescription');
        const aboutFeatures = document.getElementById('aboutFeatures');
        const aboutNetwork = document.getElementById('aboutNetwork');
        const aboutToken = document.getElementById('aboutToken');
        
        if (aboutTitle) aboutTitle.textContent = config.BRANDING.gameTitle;
        if (aboutDescription) aboutDescription.textContent = config.BRANDING.description;
        if (aboutNetwork) aboutNetwork.textContent = config.NETWORK.name;
        if (aboutToken) aboutToken.textContent = config.CONTRACT_SYMBOL;
        
        // Populate features
        if (aboutFeatures && config.FEATURES) {
            aboutFeatures.innerHTML = '';
            config.FEATURES.forEach(feature => {
                const featureItem = document.createElement('div');
                featureItem.className = 'feature-item';
                featureItem.textContent = feature;
                aboutFeatures.appendChild(featureItem);
            });
        }
        
        // Show modal
        const modal = document.getElementById('aboutModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
        }
    }
    
    closeAbout() {
        const modal = document.getElementById('aboutModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = ''; // Restore scrolling
        }
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new GoKartsGame();
});