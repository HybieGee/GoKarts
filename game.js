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
        this.trackImage.src = 'Map.png';
        
        // Game data
        this.players = [];
        this.localPlayer = null;
        this.currentLap = 1;
        this.maxLaps = 3;
        this.raceStartTime = 0;
        this.raceFinished = false;
        
        // Checkpoint system - bars across track matching your layout
        this.checkpoints = [
            { x1: 980, y1: 580, x2: 980, y2: 660, width: 80 },   // Checkpoint 1 (right side, after start)
            { x1: 920, y1: 480, x2: 860, y2: 480, width: 80 },   // Checkpoint 2 (horizontal, upper right)
            { x1: 340, y1: 560, x2: 340, y2: 640, width: 80 },   // Checkpoint 3 (vertical, bottom left)
            { x1: 280, y1: 320, x2: 360, y2: 320, width: 80 },   // Checkpoint 4 (horizontal, top left)
            { x1: 500, y1: 200, x2: 500, y2: 280, width: 80 },   // Checkpoint 5 (vertical, top middle)
            { x1: 580, y1: 360, x2: 660, y2: 360, width: 80 },   // Checkpoint 6 (horizontal, center)
            { x1: 780, y1: 460, x2: 780, y2: 540, width: 80 },   // Checkpoint 7 (vertical, lower right)
            { x1: 880, y1: 240, x2: 880, y2: 320, width: 80 },   // Checkpoint 8 (vertical, upper right loop)
            { x1: 1020, y1: 400, x2: 1100, y2: 400, width: 80 }  // Checkpoint 9 (horizontal, right side)
        ];
        
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
        
        // Starting positions at the checkered finish line (bottom right of track)
        const startPositions = [
            { x: 1080, y: 630 },  // Front row center
            { x: 1060, y: 610 },  // Front row left
            { x: 1100, y: 610 },  // Front row right
            { x: 1040, y: 590 },  // Back row left
            { x: 1120, y: 590 }   // Back row right
        ];
        
        // Local player (always player 1)
        this.localPlayer = {
            id: 1,
            name: 'You',
            x: startPositions[0].x,
            y: startPositions[0].y,
            angle: 0, // Start facing right (0 radians)
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
            image: this.playerImages[0],
            checkpointsPassed: [],
            lastCheckpoint: -1
        };
        this.players.push(this.localPlayer);
        
        // AI players
        for (let i = 1; i < 5; i++) {
            this.players.push({
                id: i + 1,
                name: `Player ${i + 1}`,
                x: startPositions[i].x,
                y: startPositions[i].y,
                angle: 0,
                velocity: { x: 0, y: 0 },
                speed: 0,
                maxSpeed: 3 + Math.random() * 0.5,
                acceleration: 0.2 + Math.random() * 0.05,
                deceleration: 0.5,
                friction: 0.85,
                turnSpeed: 0.06 + Math.random() * 0.02,
                lapCount: 1,
                position: i + 1,
                isLocal: false,
                image: this.playerImages[i],
                aiTarget: { x: 300, y: 150 }, // First turn target
                checkpointsPassed: [],
                lastCheckpoint: -1
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
        
        // Update checkpoints
        this.updateCheckpoints();
        
        // Update race positions
        this.updateRacePositions();
        
        // Check for race completion
        this.checkRaceCompletion();
        
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
        player.x += player.velocity.x;
        player.y += player.velocity.y;
        
        // Keep player on screen
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
    
    updateCheckpoints() {
        this.players.forEach(player => {
            this.checkpoints.forEach((checkpoint, index) => {
                // Check if player crossed the checkpoint line
                const crossed = this.lineIntersectsCircle(
                    checkpoint.x1, checkpoint.y1, 
                    checkpoint.x2, checkpoint.y2,
                    player.x, player.y, 30
                );
                
                if (crossed) {
                    // Check if this is the next checkpoint in sequence
                    const expectedNext = player.lastCheckpoint + 1;
                    
                    if (index === expectedNext) {
                        player.checkpointsPassed.push(index);
                        player.lastCheckpoint = index;
                        
                        // If completed all checkpoints, ready for lap completion
                        if (player.checkpointsPassed.length === this.checkpoints.length) {
                            player.readyForLap = true;
                        }
                    }
                }
            });
        });
    }
    
    lineIntersectsCircle(x1, y1, x2, y2, cx, cy, radius) {
        // Check if a line segment intersects with a circle
        const dx = x2 - x1;
        const dy = y2 - y1;
        const fx = x1 - cx;
        const fy = y1 - cy;
        
        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = (fx * fx + fy * fy) - radius * radius;
        
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) return false;
        
        const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
        const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
        
        return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
    }
    
    updateRacePositions() {
        // Calculate position based on laps and checkpoints
        this.players.forEach(player => {
            const lapProgress = player.lapCount - 1;
            const checkpointProgress = player.checkpointsPassed.length / this.checkpoints.length;
            player.raceProgress = lapProgress + checkpointProgress;
        });
        
        // Sort by race progress and assign positions
        const sortedPlayers = [...this.players].sort((a, b) => b.raceProgress - a.raceProgress);
        sortedPlayers.forEach((player, index) => {
            player.position = index + 1;
        });
    }
    
    checkRaceCompletion() {
        // Check if players cross start/finish line with all checkpoints completed
        this.players.forEach(player => {
            // Start/finish line at checkered flag area (matches visual checkered flag)
            const crossed = this.lineIntersectsCircle(
                1020, 630,  // Start/finish line coordinates
                1120, 630,
                player.x, player.y, 30
            );
            
            if (crossed && player.readyForLap) {
                player.lapCount++;
                player.checkpointsPassed = []; // Reset checkpoints for next lap
                player.lastCheckpoint = -1;
                player.readyForLap = false;
                
                if (player.lapCount > this.maxLaps && !this.raceFinished) {
                    this.finishRace(player);
                }
            }
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
        
        // Draw checkpoints
        this.drawCheckpoints();
        
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
        // Start/finish line at checkered flag area (bottom right)
        this.ctx.strokeStyle = 'white';
        this.ctx.fillStyle = 'black';
        this.ctx.lineWidth = 2;
        
        // Draw checkered pattern at bottom right of track
        const startX = 1020;
        const startY = 610;
        const squareSize = 10;
        const rows = 4;
        const cols = 10;
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                if ((i + j) % 2 === 0) {
                    this.ctx.fillRect(startX + j * squareSize, startY + i * squareSize, squareSize, squareSize);
                }
            }
        }
        this.ctx.strokeRect(startX, startY, cols * squareSize, rows * squareSize);
    }
    
    drawCheckpoints() {
        if (!this.localPlayer) return;
        
        this.checkpoints.forEach((checkpoint, index) => {
            const passed = this.localPlayer.checkpointsPassed.includes(index);
            const isNext = this.localPlayer.lastCheckpoint + 1 === index;
            
            // Set checkpoint color based on status
            if (passed) {
                this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)'; // Green if passed
            } else if (isNext) {
                this.ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Yellow if next
                this.ctx.shadowColor = 'yellow';
                this.ctx.shadowBlur = 10;
            } else {
                this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)'; // Red if not reached
            }
            
            // Draw checkpoint bar
            this.ctx.lineWidth = 6;
            this.ctx.beginPath();
            this.ctx.moveTo(checkpoint.x1, checkpoint.y1);
            this.ctx.lineTo(checkpoint.x2, checkpoint.y2);
            this.ctx.stroke();
            this.ctx.shadowBlur = 0;
            
            // Draw checkpoint number
            const midX = (checkpoint.x1 + checkpoint.x2) / 2;
            const midY = (checkpoint.y1 + checkpoint.y2) / 2;
            
            this.ctx.fillStyle = 'white';
            this.ctx.strokeStyle = 'black';
            this.ctx.lineWidth = 3;
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.strokeText(String(index + 1), midX, midY);
            this.ctx.fillText(String(index + 1), midX, midY);
        });
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