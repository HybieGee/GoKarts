// GoKarts Racing Game
class GoKartsGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentScreen = 'mainMenu';
        this.gameState = 'menu'; // menu, waiting, racing, results
        
        // Player assets
        this.playerImages = [];
        this.loadPlayerAssets();
        
        // Track image
        this.trackImage = new Image();
        this.trackImage.onload = () => {
            console.log('Track image loaded successfully');
        };
        this.trackImage.onerror = () => {
            console.log('Could not load track image, using fallback design');
        };
        // Try to load custom track image
        this.trackImage.src = 'track.png';
        
        // Game data
        this.players = [];
        this.localPlayer = null;
        this.currentLap = 1;
        this.maxLaps = 3;
        this.raceStartTime = 0;
        this.raceFinished = false;
        
        // Leaderboard data (stored locally for now)
        this.leaderboard = this.loadLeaderboard();
        
        // Controls
        this.keys = {};
        
        this.initializeEventListeners();
        this.showScreen('mainMenu');
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
        
        // Simulate finding players (in real implementation, this would connect to server)
        setTimeout(() => {
            this.startRace();
        }, 2000);
    }
    
    cancelMatchmaking() {
        this.showScreen('mainMenu');
        this.gameState = 'menu';
    }
    
    startRace() {
        this.showScreen('gameScreen');
        this.gameState = 'racing';
        this.initializeRace();
        this.gameLoop();
    }
    
    initializeRace() {
        // Create 5 players (including local player)
        this.players = [];
        
        // Starting positions at the start/finish line
        const startPositions = [
            { x: 150, y: 180 },
            { x: 150, y: 200 },
            { x: 150, y: 220 },
            { x: 130, y: 190 },
            { x: 130, y: 210 }
        ];
        
        // Local player (always player 1)
        this.localPlayer = {
            id: 1,
            name: 'You',
            x: startPositions[0].x,
            y: startPositions[0].y,
            angle: 0.3, // Slight angle to start turning into track
            velocity: { x: 0, y: 0 },
            speed: 0,
            maxSpeed: 6,
            acceleration: 0.4,
            deceleration: 0.6,
            friction: 0.85,
            turnSpeed: 0.08,
            lapCount: 1,
            position: 1,
            isLocal: true,
            image: this.playerImages[0]
        };
        this.players.push(this.localPlayer);
        
        // AI players
        for (let i = 1; i < 5; i++) {
            this.players.push({
                id: i + 1,
                name: `Player ${i + 1}`,
                x: startPositions[i].x,
                y: startPositions[i].y,
                angle: 0.3 + (Math.random() - 0.5) * 0.2,
                velocity: { x: 0, y: 0 },
                speed: 0,
                maxSpeed: 4 + Math.random(),
                acceleration: 0.25 + Math.random() * 0.1,
                deceleration: 0.5,
                friction: 0.85,
                turnSpeed: 0.06 + Math.random() * 0.02,
                lapCount: 1,
                position: i + 1,
                isLocal: false,
                image: this.playerImages[i],
                aiTarget: { x: 300, y: 150 } // First turn target
            });
        }
        
        this.currentLap = 1;
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
        
        // Update AI players
        this.players.forEach(player => {
            if (!player.isLocal) {
                this.updateAIPlayer(player);
            }
        });
        
        // Update race positions
        this.updateRacePositions();
        
        // Check for race completion
        this.checkRaceCompletion();
        
        // Update UI
        this.updateRaceUI();
    }
    
    updatePlayer(player) {
        if (player.isLocal) {
            // Handle local player input with proper kart physics
            let accelerating = false;
            let braking = false;
            let turning = 0;
            
            // Forward/Backward controls
            if (this.keys['w'] || this.keys['ArrowUp']) {
                player.speed += player.acceleration;
                accelerating = true;
            } else if (this.keys['s'] || this.keys['ArrowDown']) {
                player.speed -= player.deceleration;
                braking = true;
            }
            
            // Turning controls (only work when moving)
            if ((this.keys['a'] || this.keys['ArrowLeft']) && Math.abs(player.speed) > 0.1) {
                turning = -1;
            }
            if ((this.keys['d'] || this.keys['ArrowRight']) && Math.abs(player.speed) > 0.1) {
                turning = 1;
            }
            
            // Apply turning based on speed (faster = sharper turns)
            if (turning !== 0) {
                const turnAmount = player.turnSpeed * Math.abs(player.speed) / player.maxSpeed;
                player.angle += turning * turnAmount;
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
        
        // Calculate velocity components based on angle and speed
        player.velocity.x = Math.cos(player.angle) * player.speed;
        player.velocity.y = Math.sin(player.angle) * player.speed;
        
        // Update position using velocity
        player.x += player.velocity.x;
        player.y += player.velocity.y;
        
        // Keep player on screen (simple boundary)
        player.x = Math.max(30, Math.min(this.canvas.width - 30, player.x));
        player.y = Math.max(30, Math.min(this.canvas.height - 30, player.y));
    }
    
    updateAIPlayer(player) {
        // Simple AI: move towards target, then create new random target
        const dx = player.aiTarget.x - player.x;
        const dy = player.aiTarget.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) {
            // Create new random target
            player.aiTarget = {
                x: Math.random() * (this.canvas.width - 100) + 50,
                y: Math.random() * (this.canvas.height - 100) + 50
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
    
    updateRacePositions() {
        // Simple position calculation based on distance traveled
        this.players.forEach(player => {
            player.distanceTraveled = player.x + (player.lapCount - 1) * 1000;
        });
        
        // Sort by distance and assign positions
        const sortedPlayers = [...this.players].sort((a, b) => b.distanceTraveled - a.distanceTraveled);
        sortedPlayers.forEach((player, index) => {
            player.position = index + 1;
        });
    }
    
    checkRaceCompletion() {
        // Simple lap detection - if player crosses right side of screen, increment lap
        this.players.forEach(player => {
            if (player.x > this.canvas.width - 50 && player.lastX < this.canvas.width - 100) {
                player.lapCount++;
                if (player.lapCount > this.maxLaps && !this.raceFinished) {
                    this.finishRace(player);
                }
            }
            player.lastX = player.x;
        });
    }
    
    finishRace(winner) {
        this.raceFinished = true;
        this.gameState = 'results';
        
        // Update leaderboard if local player won
        if (winner.isLocal) {
            this.updateLeaderboard('You');
        }
        
        // Show results after short delay
        setTimeout(() => {
            this.showRaceResults(winner);
        }, 1000);
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
        
        // Draw players
        this.players.forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    drawTrack() {
        if (this.trackImage && this.trackImage.complete && this.trackImage.naturalWidth > 0) {
            // Draw the custom track image scaled to canvas
            this.ctx.drawImage(this.trackImage, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            // Fallback: Create S-shaped track similar to your design
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 120;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            
            // Draw track path
            this.ctx.beginPath();
            this.ctx.moveTo(100, 200);
            this.ctx.bezierCurveTo(300, 100, 500, 300, 700, 200);
            this.ctx.bezierCurveTo(900, 100, 1100, 300, 1100, 500);
            this.ctx.bezierCurveTo(1100, 700, 900, 700, 700, 600);
            this.ctx.bezierCurveTo(500, 500, 300, 700, 100, 600);
            this.ctx.closePath();
            this.ctx.stroke();
            
            // Draw track borders with checkered pattern
            this.drawCheckeredBorder();
        }
        
        // Always draw start/finish line
        this.drawStartFinishLine();
    }
    
    drawCheckeredBorder() {
        // This would create a checkered border pattern
        // For now, simple red/white stripes
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 8;
        this.ctx.setLineDash([20, 20]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(100, 200);
        this.ctx.bezierCurveTo(300, 100, 500, 300, 700, 200);
        this.ctx.bezierCurveTo(900, 100, 1100, 300, 1100, 500);
        this.ctx.bezierCurveTo(1100, 700, 900, 700, 700, 600);
        this.ctx.bezierCurveTo(500, 500, 300, 700, 100, 600);
        this.ctx.closePath();
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
    }
    
    drawStartFinishLine() {
        // Start/finish line
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 8;
        this.ctx.setLineDash([15, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(80, 150);
        this.ctx.lineTo(120, 250);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }
    
    drawPlayer(player) {
        this.ctx.save();
        this.ctx.translate(player.x, player.y);
        this.ctx.rotate(player.angle);
        
        if (player.image && player.image.complete) {
            this.ctx.drawImage(player.image, -20, -30, 40, 60);
        } else {
            // Fallback rectangle
            this.ctx.fillStyle = player.isLocal ? '#4ecdc4' : '#ff6b6b';
            this.ctx.fillRect(-15, -20, 30, 40);
        }
        
        this.ctx.restore();
        
        // Draw player name and position
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${player.name} (${player.position})`, player.x, player.y - 40);
    }
    
    showLeaderboard() {
        this.showScreen('leaderboardScreen');
    }
    
    updateLeaderboardDisplay() {
        const leaderboardList = document.getElementById('leaderboardList');
        leaderboardList.innerHTML = '';
        
        if (this.leaderboard.length === 0) {
            leaderboardList.innerHTML = '<p style="text-align: center; padding: 20px;">No races completed yet!</p>';
            return;
        }
        
        this.leaderboard.forEach((entry, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'leaderboard-entry';
            if (index === 0) entryDiv.classList.add('top');
            
            entryDiv.innerHTML = `
                <span class="leaderboard-rank">${index + 1}</span>
                <span class="leaderboard-name">${entry.name}</span>
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
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new GoKartsGame();
});