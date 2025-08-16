// WebSocket client for Cloudflare Workers (replaces Socket.io)
class CloudflareGameClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.playerId = null;
        this.eventHandlers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    connect(workerUrl = 'wss://gokarts-multiplayer.your-subdomain.workers.dev') {
        console.log(`🔗 Connecting to: ${workerUrl}`);
        
        try {
            this.ws = new WebSocket(workerUrl);
            
            this.ws.onopen = () => {
                console.log('✅ Connected to Cloudflare Workers multiplayer!');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.playerId = this.generateId();
                this.emit('connect');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('📨 Received:', data.type, data);
                    // Trigger local handlers WITHOUT sending back to server
                    const handlers = this.eventHandlers.get(data.type) || [];
                    handlers.forEach(handler => handler(data));
                } catch (err) {
                    console.error('Failed to parse message:', err);
                    console.log('Raw message:', event.data);
                }
            };
            
            this.ws.onclose = (event) => {
                console.log(`❌ Disconnected from Cloudflare Workers (Code: ${event.code}, Reason: ${event.reason})`);
                this.isConnected = false;
                this.emit('disconnect');
                
                // Don't auto-reconnect if it was a normal close
                if (event.code !== 1000) {
                    this.attemptReconnect();
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('🚨 WebSocket error:', error);
                console.log('Worker URL:', workerUrl);
                this.emit('connect_error', error);
            };
            
        } catch (error) {
            console.error('🚨 Failed to create WebSocket connection:', error);
            console.log('Worker URL:', workerUrl);
            this.emit('connect_error', error);
        }
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
        if (eventType === 'connect' || eventType === 'disconnect' || eventType === 'connect_error') {
            // Handle connection events
            const handlers = this.eventHandlers.get(eventType) || [];
            handlers.forEach(handler => handler(data));
        } else {
            // Send data to server
            if (this.isConnected && this.ws) {
                const message = {
                    type: eventType,
                    ...data
                };
                this.ws.send(JSON.stringify(message));
            } else {
                console.warn('Cannot send message: not connected');
            }
        }
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
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Socket.io compatibility methods
    get id() {
        return this.playerId;
    }

    get connected() {
        return this.isConnected;
    }
}

// Create global io-like interface for compatibility
window.createCloudflareClient = () => {
    return new CloudflareGameClient();
};