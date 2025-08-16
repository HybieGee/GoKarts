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
        
        // Checkpoint lines - actual line segments across the track
        // Using percentages for responsive scaling
        this.checkpointLines = [
            { p1: { x: 0.86, y: 0.70 }, p2: { x: 0.86, y: 0.76 } },  // CP1: after start
            { p1: { x: 0.80, y: 0.64 }, p2: { x: 0.84, y: 0.67 } },  // CP2: right curve
            { p1: { x: 0.31, y: 0.77 }, p2: { x: 0.31, y: 0.83 } },  // CP3: bottom left
            { p1: { x: 0.32, y: 0.42 }, p2: { x: 0.37, y: 0.42 } },  // CP4: top left
            { p1: { x: 0.44, y: 0.34 }, p2: { x: 0.44, y: 0.39 } },  // CP5: top center
            { p1: { x: 0.54, y: 0.47 }, p2: { x: 0.59, y: 0.47 } },  // CP6: middle
            { p1: { x: 0.66, y: 0.62 }, p2: { x: 0.66, y: 0.67 } },  // CP7: right middle
            { p1: { x: 0.75, y: 0.42 }, p2: { x: 0.75, y: 0.47 } },  // CP8: upper right
            { p1: { x: 0.91, y: 0.53 }, p2: { x: 0.95, y: 0.53 } }   // CP9: before finish
        ];
        
        // Start/finish line
        this.startFinishLine = { p1: { x: 0.87, y: 0.77 }, p2: { x: 0.92, y: 0.80 } };
        
        // Leaderboard data (stored locally for now)
        this.leaderboard = this.loadLeaderboard();
        
        // Controls
        this.keys = {};
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.updateCheckpointPositions();
        });
        
        this.initializeEventListeners();
        this.showScreen('mainMenu');
    }
    
    updateCheckpointPositions() {
        // No longer needed - using zones instead
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
        
        // Starting positions at the checkered finish line (using percentages)
        const startPositions = [
            { x: this.canvas.width * 0.90, y: this.canvas.height * 0.79 },  // Front row center
            { x: this.canvas.width * 0.88, y: this.canvas.height * 0.76 },  // Front row left
            { x: this.canvas.width * 0.92, y: this.canvas.height * 0.76 },  // Front row right
            { x: this.canvas.width * 0.87, y: this.canvas.height * 0.74 },  // Back row left
            { x: this.canvas.width * 0.93, y: this.canvas.height * 0.74 }   // Back row right
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
            nextCheckpoint: 0,
            checkpointsPassed: [],
            prevX: startPositions[0].x,
            prevY: startPositions[0].y,
            lapStarted: false,
            lastCrossTime: 0
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
                nextCheckpoint: 0,
                checkpointsPassed: [],
                prevX: startPositions[i].x,
                prevY: startPositions[i].y,
                lapStarted: false,
                lastCrossTime: 0
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
            const sfLine = {
                p1: { x: this.startFinishLine.p1.x * this.canvas.width, 
                     y: this.startFinishLine.p1.y * this.canvas.height },
                p2: { x: this.startFinishLine.p2.x * this.canvas.width,
                     y: this.startFinishLine.p2.y * this.canvas.height }
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
                    p1: { x: checkpoint.p1.x * this.canvas.width,
                         y: checkpoint.p1.y * this.canvas.height },
                    p2: { x: checkpoint.p2.x * this.canvas.width,
                         y: checkpoint.p2.y * this.canvas.height }
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
    
    checkRaceCompletion() {
        // Check if players cross start/finish line with all checkpoints completed
        this.players.forEach(player => {
            // Start/finish line at checkered flag area (using percentages)
            const crossed = this.lineIntersectsCircle(
                this.canvas.width * 0.85, this.canvas.height * 0.79,  // Start/finish line coordinates
                this.canvas.width * 0.93, this.canvas.height * 0.79,
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
        
        // Draw checkered pattern at bottom right of track (using percentages)
        const startX = this.canvas.width * 0.85;
        const startY = this.canvas.height * 0.76;
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
        // Draw checkpoint lines
        this.checkpointLines.forEach((checkpoint, index) => {
            const p1 = { 
                x: checkpoint.p1.x * this.canvas.width,
                y: checkpoint.p1.y * this.canvas.height 
            };
            const p2 = { 
                x: checkpoint.p2.x * this.canvas.width,
                y: checkpoint.p2.y * this.canvas.height 
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
            p1: { x: this.startFinishLine.p1.x * this.canvas.width,
                  y: this.startFinishLine.p1.y * this.canvas.height },
            p2: { x: this.startFinishLine.p2.x * this.canvas.width,
                  y: this.startFinishLine.p2.y * this.canvas.height }
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