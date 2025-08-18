// WebSocket client for Cloudflare Workers - VERSION 4.0 REST CONTRACT
class CloudflareGameClient {
    constructor() {
        this.roomWs = null;
        this.isConnected = false;
        this._playerId = null;
        this.eventHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentState = 'disconnected'; // disconnected, queued, matched, in-room, racing
        this.roomId = null;
        this.baseUrl = 'https://gokarts-multiplayer-prod.stealthbundlebot.workers.dev';
        this.pollInterval = null;
        this.heartbeatInterval = null;
    }

    connect(baseUrl = 'https://gokarts-multiplayer-prod.stealthbundlebot.workers.dev') {
        this.baseUrl = baseUrl;
        this._playerId = this.generateId();
        this.isConnected = true;
        this.currentState = 'connected';
        console.log(`✅ Client initialized with base URL: ${baseUrl}, Player ID: ${this._playerId}`);
        console.log(`🔥 About to emit connect event. Handlers:`, this.eventHandlers.get('connect'));
        this.emit('connect');
        console.log(`🔥 Connect event emitted!`);
    }

    // Join matchmaking queue using REST API
    async joinQueue() {
        if (!this._playerId) {
            throw new Error('Player ID not set');
        }

        try {
            console.log(`🏁 Joining queue with player ID: ${this._playerId}`);
            const response = await fetch(`${this.baseUrl}/api/queue/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: this._playerId })
            });

            const result = await response.json();
            console.log('Queue join result:', result);

            if (result.status === 'matched') {
                // Immediately matched!
                this.currentState = 'matched';
                this.roomId = result.roomId;
                this.emit('match-found', result);
                // Small delay to ensure room is ready
                setTimeout(async () => {
                    await this.connectToRoom(result.wsUrl);
                }, 500);
            } else if (result.status === 'queued') {
                // Start polling
                this.currentState = 'queued';
                this.emit('queue-update', result);
                this.startPolling();
            }

            return result;
        } catch (error) {
            console.error('Failed to join queue:', error);
            this.emit('connect_error', error);
            throw error;
        }
    }

    // Start polling for queue updates
    startPolling() {
        if (this.pollInterval) return;

        this.pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.baseUrl}/api/queue/poll?playerId=${this._playerId}`);
                const result = await response.json();
                console.log('Poll result:', result);

                if (result.status === 'matched') {
                    this.stopPolling();
                    this.currentState = 'matched';
                    this.roomId = result.roomId;
                    this.emit('match-found', result);
                    // Small delay to ensure room is ready
                    setTimeout(async () => {
                        await this.connectToRoom(result.wsUrl);
                    }, 500);
                } else if (result.status === 'queued') {
                    this.emit('queue-update', result);
                } else if (result.status === 'timeout') {
                    this.stopPolling();
                    this.currentState = 'disconnected';
                    this.emit('queue-timeout');
                }
            } catch (error) {
                console.error('Polling error:', error);
                this.emit('connect_error', error);
            }
        }, 2000); // Poll every 2 seconds
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    // Cancel queue
    async cancelQueue() {
        try {
            await fetch(`${this.baseUrl}/api/queue/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerId: this._playerId })
            });
            this.stopPolling();
            this.currentState = 'connected';
            this.emit('queue-cancelled');
        } catch (error) {
            console.error('Failed to cancel queue:', error);
        }
    }

    // Connect to WebSocket room
    async connectToRoom(wsUrl) {
        console.log(`🏠 Connecting to room: ${wsUrl}`);
        
        try {
            this.roomWs = new WebSocket(wsUrl);
            
            this.roomWs.onopen = () => {
                console.log('✅ Connected to race room!');
                this.currentState = 'in-room';
                
                // Send HELLO message with player name
                const playerName = localStorage.getItem('gokarts_player_name') || this._playerId;
                const helloMsg = { t: "HELLO", playerId: this._playerId, playerName: playerName };
                console.log('📤 Sending HELLO message:', helloMsg);
                this.sendRoomMessage(helloMsg);
                
                // Start heartbeat
                this.startHeartbeat();
                
                this.emit('room-connected');
            };
            
            this.roomWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('📨 Room received:', data.t, data);
                    this.handleRoomMessage(data);
                } catch (err) {
                    console.error('Failed to parse room message:', err);
                }
            };
            
            this.roomWs.onclose = (event) => {
                console.log(`❌ Room disconnected (Code: ${event.code})`);
                this.stopHeartbeat();
                
                // If disconnected before race started, try to re-queue
                if (this.currentState === 'in-room') {
                    console.log('🔄 Connection lost before race start, attempting to re-queue...');
                    this.currentState = 'connected';
                    this.emit('connection-lost-requeue');
                } else {
                    this.currentState = 'disconnected';
                    this.emit('disconnect');
                }
            };
            
            this.roomWs.onerror = (error) => {
                console.error('🚨 Room WebSocket error:', error);
                this.emit('connect_error', error);
            };
            
        } catch (error) {
            console.error('🚨 Failed to connect to room:', error);
            this.emit('connect_error', error);
        }
    }

    handleRoomMessage(data) {
        switch (data.t) {
            case 'WELCOME':
                console.log(`🎉 Welcome to room ${data.roomId}! Players: ${data.players.length}`);
                this.emit('welcome', data);
                break;
            case 'START':
                console.log(`🚀 Race starting! Countdown: ${data.countdown}`);
                this.currentState = 'racing';
                this.emit('race-countdown', data);
                break;
            case 'PEER_JOIN':
                console.log(`👤 Player ${data.playerId} joined`);
                this.emit('peer-join', data);
                break;
            case 'PEER_LEAVE':
                console.log(`👋 Player ${data.playerId} left`);
                this.emit('peer-leave', data);
                break;
            case 'PEER_STATE':
                this.emit('peer-state', data);
                break;
            case 'PONG':
                // Heartbeat response
                break;
            case 'KICK':
                console.warn(`🚨 Kicked from room: ${data.reason}`);
                this.emit('kicked', data);
                break;
            case 'RACE_END':
                console.log(`🏁 Race ended, winner: ${data.winner.name}`);
                this.emit('race-end', data);
                break;
            case 'END':
                console.log(`🏁 Room ended: ${data.reason}`);
                this.emit('room-end', data);
                break;
            default:
                console.warn('Unknown room message:', data.t);
        }
    }

    // Send message to room WebSocket
    sendRoomMessage(message) {
        if (this.roomWs && this.roomWs.readyState === WebSocket.OPEN) {
            const msgStr = JSON.stringify(message);
            console.log('📤 Sending to room:', msgStr);
            this.roomWs.send(msgStr);
        } else {
            console.warn('Cannot send room message: not connected, readyState:', this.roomWs?.readyState);
        }
    }

    // Start heartbeat pings
    startHeartbeat() {
        if (this.heartbeatInterval) return;
        
        this.heartbeatInterval = setInterval(() => {
            this.sendRoomMessage({ t: "PING" });
        }, 10000); // Ping every 10 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // Send game state
    sendGameState(pos) {
        this.sendRoomMessage({
            t: "STATE",
            pos: pos
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
                this.connect();
            }, 2000 * this.reconnectAttempts); // Exponential backoff
        } else {
            console.log('❌ Max reconnection attempts reached');
        }
    }

    emit(eventType, data = {}) {
        // All events are now local events (no automatic sending to server)
        const handlers = this.eventHandlers.get(eventType) || [];
        handlers.forEach(handler => handler(data));
    }

    on(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    off(eventType, handler) {
        const handlers = this.eventHandlers.get(eventType) || [];
        const index = handlers.indexOf(handler);
        if (index > -1) {
            handlers.splice(index, 1);
        }
    }

    disconnect() {
        this.stopPolling();
        this.stopHeartbeat();
        
        if (this.roomWs) {
            this.roomWs.close();
            this.roomWs = null;
        }
        
        this.isConnected = false;
        this.currentState = 'disconnected';
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Socket.io compatibility methods
    get id() {
        return this._playerId;
    }

    get playerId() {
        return this._playerId;
    }

    get connected() {
        return this.isConnected;
    }
    
    // Additional helper methods
    isInQueue() {
        return this.currentState === 'matchmaking';
    }
    
    isInRoom() {
        return this.currentState === 'in-room' || this.currentState === 'racing';
    }
    
    getCurrentState() {
        return this.currentState;
    }
}

// Create global io-like interface for compatibility
window.createCloudflareClient = () => {
    return new CloudflareGameClient();
};