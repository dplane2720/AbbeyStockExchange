/**
 * Abbey Stock Exchange v5 - State Manager
 * 
 * Central state management system for the application.
 * Handles complex application state, event-driven updates,
 * and state persistence across page reloads.
 */

window.StateManager = (function() {
    'use strict';
    
    // Central application state
    let state = {
        // Core application data
        drinks: [],
        settings: {},
        metadata: {},
        
        // UI state
        ui: {
            currentView: 'customer-display',
            modalsOpen: [],
            loading: false,
            errors: [],
            notifications: []
        },
        
        // Real-time state
        realtime: {
            connected: false,
            lastUpdate: null,
            nextRefresh: null,
            refreshCountdown: 0,
            priceEngine: {
                running: false,
                refreshCycle: 120
            }
        },
        
        // Admin state
        admin: {
            selectedDrink: null,
            editMode: false,
            pendingChanges: false,
            formData: {}
        }
    };
    
    // Event listeners for state changes
    const listeners = new Map();
    const persistenceKey = 'abbey-stock-exchange-state';
    let debugMode = false;
    
    /**
     * Get nested value from object using dot notation
     */
    function getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    /**
     * Set nested value in object using dot notation
     */
    function setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!(key in current)) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }
    
    /**
     * Check if path matches wildcard pattern
     */
    function pathMatches(path, pattern) {
        const pathParts = path.split('.');
        const patternParts = pattern.split('.');
        
        if (patternParts.length > pathParts.length) return false;
        
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i] !== '*' && patternParts[i] !== pathParts[i]) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Notify listeners of state changes
     */
    function notifyListeners(path, newValue, oldValue) {
        // Notify exact path listeners
        const exactListeners = listeners.get(path);
        if (exactListeners) {
            exactListeners.forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (error) {
                    console.error(`[StateManager] Listener error for path ${path}:`, error);
                }
            });
        }
        
        // Notify wildcard listeners
        listeners.forEach((listenerSet, listenerPath) => {
            if (listenerPath.includes('*') && pathMatches(path, listenerPath)) {
                listenerSet.forEach(callback => {
                    try {
                        callback(newValue, oldValue, path);
                    } catch (error) {
                        console.error(`[StateManager] Wildcard listener error for ${listenerPath}:`, error);
                    }
                });
            }
        });
    }
    
    /**
     * Check if state path should be persisted
     */
    function shouldPersist(path) {
        // Don't persist temporary UI state
        if (path.startsWith('ui.loading') || path.startsWith('ui.errors')) {
            return false;
        }
        
        // Don't persist real-time connection state
        if (path.startsWith('realtime.connected')) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Persist current state to localStorage
     */
    function persistState() {
        try {
            const persistableState = {
                settings: state.settings,
                ui: {
                    currentView: state.ui.currentView
                },
                admin: state.admin
            };
            
            localStorage.setItem(persistenceKey, JSON.stringify(persistableState));
            
            if (debugMode) {
                console.log('[StateManager] State persisted to localStorage');
            }
        } catch (error) {
            console.warn('[StateManager] Failed to persist state:', error);
        }
    }
    
    /**
     * Load persisted state from localStorage
     */
    function loadPersistedState() {
        try {
            const persisted = localStorage.getItem(persistenceKey);
            if (persisted) {
                const persistedState = JSON.parse(persisted);
                
                // Merge persisted state with current state
                if (persistedState.settings) {
                    state.settings = { ...state.settings, ...persistedState.settings };
                }
                
                if (persistedState.ui) {
                    state.ui = { ...state.ui, ...persistedState.ui };
                }
                
                if (persistedState.admin) {
                    state.admin = { ...state.admin, ...persistedState.admin };
                }
                
                if (debugMode) {
                    console.log('[StateManager] Loaded persisted state:', persistedState);
                }
            }
        } catch (error) {
            console.warn('[StateManager] Failed to load persisted state:', error);
        }
    }
    
    /**
     * Dispatch a custom event with state context
     */
    function dispatch(eventType, payload = null) {
        const event = new CustomEvent(`state:${eventType}`, {
            detail: {
                payload,
                state: { ...state },
                timestamp: Date.now()
            }
        });
        
        document.dispatchEvent(event);
        
        if (debugMode) {
            console.log(`[StateManager] Dispatched event: ${eventType}`, payload);
        }
    }
    
    // Setup beforeunload handler
    window.addEventListener('beforeunload', () => {
        persistState();
    });
    
    // Public API
    return {
        /**
         * Initialize the state manager
         */
        init: function() {
            loadPersistedState();
            
            if (debugMode) {
                console.log('[StateManager] Initialized with state:', state);
            }
        },
        
        /**
         * Get the current state or a specific path
         * @param {string} path - Dot notation path to specific state
         * @returns {*} State value
         */
        getState: function(path = null) {
            if (!path) {
                return { ...state };
            }
            
            return getNestedValue(state, path);
        },
        
        /**
         * Update state with new data
         * @param {string} path - Dot notation path to update
         * @param {*} value - New value
         * @param {boolean} notify - Whether to notify listeners
         */
        setState: function(path, value, notify = true) {
            const oldValue = getNestedValue(state, path);
            setNestedValue(state, path, value);
            
            if (debugMode) {
                console.log(`[StateManager] State updated: ${path}`, { oldValue, newValue: value });
            }
            
            if (notify) {
                notifyListeners(path, value, oldValue);
            }
            
            // Auto-persist critical state changes
            if (shouldPersist(path)) {
                persistState();
            }
        },
        
        /**
         * Update multiple state paths at once
         * @param {Object} updates - Object with path: value pairs
         * @param {boolean} notify - Whether to notify listeners
         */
        batchUpdate: function(updates, notify = true) {
            const changes = [];
            
            Object.entries(updates).forEach(([path, value]) => {
                const oldValue = getNestedValue(state, path);
                setNestedValue(state, path, value);
                changes.push({ path, value, oldValue });
            });
            
            if (debugMode) {
                console.log('[StateManager] Batch state update:', changes);
            }
            
            if (notify) {
                changes.forEach(({ path, value, oldValue }) => {
                    notifyListeners(path, value, oldValue);
                });
            }
            
            persistState();
        },
        
        /**
         * Subscribe to state changes
         * @param {string} path - State path to watch (supports wildcards)
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        subscribe: function(path, callback) {
            if (!listeners.has(path)) {
                listeners.set(path, new Set());
            }
            
            listeners.get(path).add(callback);
            
            if (debugMode) {
                console.log(`[StateManager] Subscribed to: ${path}`);
            }
            
            // Return unsubscribe function
            return function() {
                const pathListeners = listeners.get(path);
                if (pathListeners) {
                    pathListeners.delete(callback);
                    if (pathListeners.size === 0) {
                        listeners.delete(path);
                    }
                }
            };
        },
        
        /**
         * Subscribe to multiple state paths
         * @param {Array} paths - Array of state paths
         * @param {Function} callback - Callback function
         * @returns {Function} Unsubscribe function
         */
        subscribeMultiple: function(paths, callback) {
            const unsubscribeFunctions = paths.map(path => this.subscribe(path, callback));
            
            return function() {
                unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
            };
        },
        
        /**
         * Dispatch a custom event with state context
         * @param {string} eventType - Event type
         * @param {*} payload - Event payload
         */
        dispatch: dispatch,
        
        /**
         * Update drinks data from API response
         * @param {Array} drinks - Drinks array
         */
        updateDrinks: function(drinks) {
            this.setState('drinks', drinks);
            this.setState('realtime.lastUpdate', new Date().toISOString());
            dispatch('drinks-updated', drinks);
        },
        
        /**
         * Update settings data
         * @param {Object} settings - Settings object
         */
        updateSettings: function(settings) {
            this.setState('settings', settings);
            dispatch('settings-updated', settings);
        },
        
        /**
         * Update real-time connection status
         * @param {boolean} connected - Connection status
         */
        updateConnectionStatus: function(connected) {
            this.setState('realtime.connected', connected);
            dispatch('connection-status-changed', connected);
        },
        
        /**
         * Update price engine status
         * @param {Object} status - Price engine status
         */
        updatePriceEngineStatus: function(status) {
            this.batchUpdate({
                'realtime.priceEngine.running': status.running,
                'realtime.priceEngine.refreshCycle': status.refresh_cycle,
                'realtime.nextRefresh': status.next_refresh
            });
            dispatch('price-engine-status-updated', status);
        },
        
        /**
         * Add UI notification
         * @param {string} type - Notification type (success, error, warning, info)
         * @param {string} message - Notification message
         * @param {number} duration - Auto-dismiss duration in ms
         */
        addNotification: function(type, message, duration = 5000) {
            const notification = {
                id: Date.now() + Math.random(),
                type,
                message,
                timestamp: Date.now(),
                duration
            };
            
            const notifications = this.getState('ui.notifications');
            this.setState('ui.notifications', [...notifications, notification]);
            
            // Auto-dismiss
            if (duration > 0) {
                setTimeout(() => {
                    this.removeNotification(notification.id);
                }, duration);
            }
            
            dispatch('notification-added', notification);
        },
        
        /**
         * Remove notification
         * @param {string} id - Notification ID
         */
        removeNotification: function(id) {
            const notifications = this.getState('ui.notifications').filter(n => n.id !== id);
            this.setState('ui.notifications', notifications);
            dispatch('notification-removed', id);
        },
        
        /**
         * Set loading state
         * @param {boolean} loading - Loading state
         */
        setLoading: function(loading) {
            this.setState('ui.loading', loading);
        },
        
        /**
         * Add error to state
         * @param {Error|string} error - Error object or message
         */
        addError: function(error) {
            const errorObj = {
                id: Date.now(),
                message: error.message || error,
                timestamp: Date.now(),
                stack: error.stack || null
            };
            
            const errors = this.getState('ui.errors');
            this.setState('ui.errors', [...errors, errorObj]);
            dispatch('error-added', errorObj);
        },
        
        /**
         * Clear all errors
         */
        clearErrors: function() {
            this.setState('ui.errors', []);
            dispatch('errors-cleared');
        },
        
        /**
         * Open modal
         * @param {string} modalId - Modal identifier
         * @param {Object} data - Modal data
         */
        openModal: function(modalId, data = {}) {
            const modalsOpen = this.getState('ui.modalsOpen');
            if (!modalsOpen.includes(modalId)) {
                this.setState('ui.modalsOpen', [...modalsOpen, modalId]);
            }
            dispatch('modal-opened', { modalId, data });
        },
        
        /**
         * Close modal
         * @param {string} modalId - Modal identifier
         */
        closeModal: function(modalId) {
            const modalsOpen = this.getState('ui.modalsOpen').filter(id => id !== modalId);
            this.setState('ui.modalsOpen', modalsOpen);
            dispatch('modal-closed', modalId);
        },
        
        /**
         * Check if modal is open
         * @param {string} modalId - Modal identifier
         * @returns {boolean}
         */
        isModalOpen: function(modalId) {
            return this.getState('ui.modalsOpen').includes(modalId);
        },
        
        /**
         * Reset state to defaults
         */
        reset: function() {
            state = {
                drinks: [],
                settings: {},
                metadata: {},
                ui: {
                    currentView: 'customer-display',
                    modalsOpen: [],
                    loading: false,
                    errors: [],
                    notifications: []
                },
                realtime: {
                    connected: false,
                    lastUpdate: null,
                    nextRefresh: null,
                    refreshCountdown: 0,
                    priceEngine: {
                        running: false,
                        refreshCycle: 120
                    }
                },
                admin: {
                    selectedDrink: null,
                    editMode: false,
                    pendingChanges: false,
                    formData: {}
                }
            };
            
            persistState();
            dispatch('state-reset');
        },
        
        /**
         * Enable debug mode
         */
        enableDebug: function() {
            debugMode = true;
            console.log('[StateManager] Debug mode enabled');
        },
        
        /**
         * Disable debug mode
         */
        disableDebug: function() {
            debugMode = false;
        },
        
        /**
         * Get debug information
         * @returns {Object} Debug information
         */
        getDebugInfo: function() {
            return {
                state: state,
                listeners: Array.from(listeners.keys()),
                persistenceKey: persistenceKey,
                debugMode: debugMode
            };
        }
    };
})();