/**
 * Abbey Stock Exchange v5 - WebSocket Client
 * 
 * Manages WebSocket connection, real-time updates, connection recovery,
 * and subscription management for the application.
 */

window.WebSocketClient = (function() {
    'use strict';
    
    let socket = null;
    let isConnected = false;
    let isConnecting = false;
    let clientId = null;
    let reconnectAttempts = 0;
    let maxReconnectAttempts = 10;
    let reconnectDelay = 1000;
    let maxReconnectDelay = 30000;
    let heartbeatInterval = null;
    let heartbeatTimer = 30000; // 30 seconds
    let subscriptions = new Set();
    let messageQueue = [];
    let eventHandlers = new Map();
    
    // Connection configuration
    const config = {
        autoReconnect: true,
        debug: false,
        maxMessageQueueSize: 100
    };
    
    /**
     * Get WebSocket URL
     */
    function getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        // Fix: Use correct WebSocket endpoint for Flask-SocketIO
        return `${protocol}//${host}/ws`;
    }
    
    /**
     * Log debug messages
     */
    function debug(...args) {
        if (config.debug) {
            console.log('[WebSocketClient]', ...args);
        }
    }
    
    /**
     * Emit custom event
     */
    function emit(eventType, data) {
        const event = new CustomEvent(`websocket:${eventType}`, {
            detail: data
        });
        document.dispatchEvent(event);
    }
    
    /**
     * Call event handlers
     */
    function callEventHandlers(eventType, data) {
        const handlers = eventHandlers.get(eventType);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[WebSocketClient] Handler error for ${eventType}:`, error);
                }
            });
        }
    }
    
    /**
     * Queue message for later sending
     */
    function queueMessage(event, data) {
        if (messageQueue.length >= config.maxMessageQueueSize) {
            messageQueue.shift(); // Remove oldest message
        }
        
        messageQueue.push({ event, data, timestamp: Date.now() });
        debug('Message queued:', event, data);
    }
    
    /**
     * Send queued messages
     */
    function sendQueuedMessages() {
        if (!isConnected || messageQueue.length === 0) {
            return;
        }
        
        debug('Sending queued messages:', messageQueue.length);
        
        messageQueue.forEach(({ event, data }) => {
            if (socket && isConnected) {
                socket.emit(event, data);
            }
        });
        
        messageQueue = [];
    }
    
    /**
     * Start heartbeat mechanism
     */
    function startHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        heartbeatInterval = setInterval(() => {
            if (isConnected && socket) {
                socket.emit('ping');
            }
        }, heartbeatTimer);
        
        debug('Heartbeat started');
    }
    
    /**
     * Stop heartbeat mechanism
     */
    function stopHeartbeat() {
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }
        
        debug('Heartbeat stopped');
    }
    
    /**
     * Calculate reconnect delay with exponential backoff
     */
    function getReconnectDelay() {
        const delay = Math.min(
            reconnectDelay * Math.pow(2, reconnectAttempts),
            maxReconnectDelay
        );
        return delay + Math.random() * 1000; // Add jitter
    }
    
    /**
     * Attempt to reconnect
     */
    function attemptReconnect() {
        if (!config.autoReconnect || isConnecting || isConnected) {
            return;
        }
        
        if (reconnectAttempts >= maxReconnectAttempts) {
            debug('Max reconnect attempts reached');
            emit('max-reconnect-attempts');
            callEventHandlers('maxReconnectAttempts', { attempts: reconnectAttempts });
            return;
        }
        
        const delay = getReconnectDelay();
        reconnectAttempts++;
        
        debug(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        
        setTimeout(() => {
            if (!isConnected && !isConnecting) {
                connect();
            }
        }, delay);
    }
    
    /**
     * Handle connection success
     */
    function handleConnect() {
        debug('Connected to WebSocket server');
        
        isConnected = true;
        isConnecting = false;
        reconnectAttempts = 0;
        
        // Start heartbeat
        startHeartbeat();
        
        // Send queued messages
        sendQueuedMessages();
        
        // Re-subscribe to events
        subscriptions.forEach(subscriptionType => {
            socket.emit('subscribe', { type: subscriptionType });
        });
        
        // Update state manager
        if (window.StateManager) {
            window.StateManager.updateConnectionStatus(true);
        }
        
        emit('connected', { clientId });
        callEventHandlers('connected', { clientId });
    }
    
    /**
     * Handle disconnection
     */
    function handleDisconnect() {
        debug('Disconnected from WebSocket server');
        
        const wasConnected = isConnected;
        isConnected = false;
        isConnecting = false;
        clientId = null;
        
        // Stop heartbeat
        stopHeartbeat();
        
        // Update state manager
        if (window.StateManager) {
            window.StateManager.updateConnectionStatus(false);
        }
        
        emit('disconnected');
        callEventHandlers('disconnected');
        
        // Attempt reconnection if we were previously connected
        if (wasConnected && config.autoReconnect) {
            attemptReconnect();
        }
    }
    
    /**
     * Handle connection error
     */
    function handleError(error) {
        debug('Connection error:', error);
        
        isConnecting = false;
        
        emit('error', error);
        callEventHandlers('error', error);
        
        if (config.autoReconnect && !isConnected) {
            attemptReconnect();
        }
    }
    
    /**
     * Connect to WebSocket server
     */
    function connect() {
        if (isConnected || isConnecting) {
            debug('Already connected or connecting');
            return Promise.resolve();
        }
        
        return new Promise((resolve, reject) => {
            try {
                debug('Connecting to WebSocket server...');
                isConnecting = true;
                
                // Use Socket.IO client
                if (typeof io === 'undefined') {
                    throw new Error('Socket.IO client library not loaded');
                }
                
                socket = io({
                    autoConnect: false,
                    timeout: 10000,
                    transports: ['websocket', 'polling']
                });
                
                // Set up event handlers
                socket.on('connect', () => {
                    handleConnect();
                    resolve();
                });
                
                socket.on('disconnect', handleDisconnect);
                socket.on('connect_error', handleError);
                
                // Handle server messages
                socket.on('connected', (data) => {
                    clientId = data.client_id;
                    debug('Received client ID:', clientId);
                });
                
                socket.on('pong', () => {
                    debug('Received pong');
                });
                
                socket.on('error', (data) => {
                    debug('Server error:', data);
                    callEventHandlers('serverError', data);
                });
                
                socket.on('subscribed', (data) => {
                    debug('Subscription confirmed:', data);
                    callEventHandlers('subscribed', data);
                });
                
                socket.on('unsubscribed', (data) => {
                    debug('Unsubscription confirmed:', data);
                    callEventHandlers('unsubscribed', data);
                });
                
                // Real-time update handlers
                socket.on('price_update', (data) => {
                    debug('Price update received:', data);
                    callEventHandlers('priceUpdate', data);
                    
                    // Update state manager
                    if (window.StateManager && data.drinks) {
                        window.StateManager.updateDrinks(data.drinks);
                    }
                });
                
                socket.on('system_status', (data) => {
                    debug('System status received:', data);
                    callEventHandlers('systemStatus', data);
                });
                
                socket.on('refresh_timer', (data) => {
                    debug('Refresh timer received:', data);
                    callEventHandlers('refreshTimer', data);
                    
                    // Update state manager
                    if (window.StateManager) {
                        window.StateManager.setState('realtime.refreshCountdown', data.time_remaining);
                        window.StateManager.setState('realtime.nextRefresh', data.next_refresh);
                    }
                });
                
                socket.on('settings_update', (data) => {
                    debug('Settings update received:', data);
                    callEventHandlers('settingsUpdate', data);
                    
                    // Update state manager with new settings
                    if (window.StateManager && data.settings) {
                        window.StateManager.setState('settings', data.settings);
                        debug('Settings updated in state manager:', Object.keys(data.settings));
                    }
                });
                
                // Connect
                socket.connect();
                
                // Set timeout for connection
                setTimeout(() => {
                    if (isConnecting) {
                        isConnecting = false;
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                isConnecting = false;
                reject(error);
            }
        });
    }
    
    /**
     * Disconnect from WebSocket server
     */
    function disconnect() {
        debug('Disconnecting from WebSocket server');
        
        config.autoReconnect = false;
        stopHeartbeat();
        
        if (socket) {
            socket.disconnect();
            socket = null;
        }
        
        isConnected = false;
        isConnecting = false;
        clientId = null;
        reconnectAttempts = 0;
        subscriptions.clear();
        messageQueue = [];
    }
    
    /**
     * Subscribe to event type
     */
    function subscribe(subscriptionType) {
        subscriptions.add(subscriptionType);
        
        if (isConnected && socket) {
            socket.emit('subscribe', { type: subscriptionType });
        } else {
            queueMessage('subscribe', { type: subscriptionType });
        }
        
        debug('Subscribed to:', subscriptionType);
    }
    
    /**
     * Unsubscribe from event type
     */
    function unsubscribe(subscriptionType) {
        subscriptions.delete(subscriptionType);
        
        if (isConnected && socket) {
            socket.emit('unsubscribe', { type: subscriptionType });
        }
        
        debug('Unsubscribed from:', subscriptionType);
    }
    
    /**
     * Send message to server
     */
    function send(event, data) {
        if (isConnected && socket) {
            socket.emit(event, data);
        } else {
            queueMessage(event, data);
        }
    }
    
    // Public API
    return {
        /**
         * Initialize WebSocket client
         */
        init: function(options = {}) {
            Object.assign(config, options);
            debug('WebSocket client initialized with config:', config);
            
            // Auto-connect if specified
            if (options.autoConnect !== false) {
                return this.connect();
            }
            
            return Promise.resolve();
        },
        
        /**
         * Connect to WebSocket server
         */
        connect: connect,
        
        /**
         * Disconnect from WebSocket server
         */
        disconnect: disconnect,
        
        /**
         * Check if connected
         */
        isConnected: function() {
            return isConnected;
        },
        
        /**
         * Get client ID
         */
        getClientId: function() {
            return clientId;
        },
        
        /**
         * Subscribe to event types
         */
        subscribe: subscribe,
        
        /**
         * Unsubscribe from event types
         */
        unsubscribe: unsubscribe,
        
        /**
         * Send message to server
         */
        send: send,
        
        /**
         * Add event handler
         */
        on: function(eventType, handler) {
            if (!eventHandlers.has(eventType)) {
                eventHandlers.set(eventType, new Set());
            }
            
            eventHandlers.get(eventType).add(handler);
            
            // Return unsubscribe function
            return () => {
                const handlers = eventHandlers.get(eventType);
                if (handlers) {
                    handlers.delete(handler);
                    if (handlers.size === 0) {
                        eventHandlers.delete(eventType);
                    }
                }
            };
        },
        
        /**
         * Remove event handler
         */
        off: function(eventType, handler) {
            const handlers = eventHandlers.get(eventType);
            if (handlers) {
                handlers.delete(handler);
                if (handlers.size === 0) {
                    eventHandlers.delete(eventType);
                }
            }
        },
        
        /**
         * Subscribe to price updates
         */
        onPriceUpdate: function(callback) {
            this.subscribe('price_updates');
            return this.on('priceUpdate', callback);
        },
        
        /**
         * Subscribe to system status updates
         */
        onSystemStatus: function(callback) {
            this.subscribe('system_status');
            return this.on('systemStatus', callback);
        },
        
        /**
         * Subscribe to refresh timer updates
         */
        onRefreshTimer: function(callback) {
            this.subscribe('timer_updates');
            return this.on('refreshTimer', callback);
        },
        
        /**
         * Subscribe to settings updates
         */
        onSettingsUpdate: function(callback) {
            // Settings updates don't require subscription - they're sent to all clients
            return this.on('settingsUpdate', callback);
        },
        
        /**
         * Configuration methods
         */
        config: {
            /**
             * Enable auto-reconnect
             */
            enableAutoReconnect: function() {
                config.autoReconnect = true;
            },
            
            /**
             * Disable auto-reconnect
             */
            disableAutoReconnect: function() {
                config.autoReconnect = false;
            },
            
            /**
             * Enable debug mode
             */
            enableDebug: function() {
                config.debug = true;
            },
            
            /**
             * Disable debug mode
             */
            disableDebug: function() {
                config.debug = false;
            },
            
            /**
             * Set reconnect parameters
             */
            setReconnectParams: function(maxAttempts, delay, maxDelay) {
                maxReconnectAttempts = maxAttempts || maxReconnectAttempts;
                reconnectDelay = delay || reconnectDelay;
                maxReconnectDelay = maxDelay || maxReconnectDelay;
            },
            
            /**
             * Set heartbeat timer
             */
            setHeartbeatTimer: function(timer) {
                heartbeatTimer = timer || heartbeatTimer;
                
                if (isConnected) {
                    stopHeartbeat();
                    startHeartbeat();
                }
            }
        },
        
        /**
         * Get connection statistics
         */
        getStats: function() {
            return {
                isConnected,
                isConnecting,
                clientId,
                reconnectAttempts,
                subscriptions: Array.from(subscriptions),
                queuedMessages: messageQueue.length,
                eventHandlers: Object.fromEntries(
                    Array.from(eventHandlers.entries()).map(([key, handlers]) => [key, handlers.size])
                )
            };
        },
        
        /**
         * Force reconnect
         */
        forceReconnect: function() {
            if (isConnected) {
                disconnect();
            }
            
            reconnectAttempts = 0;
            config.autoReconnect = true;
            return connect();
        },
        
        /**
         * Clear message queue
         */
        clearQueue: function() {
            messageQueue = [];
        }
    };
})();