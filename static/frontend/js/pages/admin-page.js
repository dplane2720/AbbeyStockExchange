/**
 * Abbey Stock Exchange v5 - Admin Page
 * 
 * Manages the admin interface for sales recording and settings.
 * Touch-optimized with real-time updates and modal navigation.
 */

window.AdminPage = (function() {
    'use strict';
    
    let isInitialized = false;
    let drinks = [];
    let websocketUnsubscribers = [];
    let stateUnsubscribers = [];
    let pressedButtons = new Set();
    
    /**
     * Format price for display
     */
    function formatPrice(price) {
        return `$${parseFloat(price).toFixed(2)}`;
    }
    
    /**
     * Get trend icon based on trend value
     */
    function getTrendIcon(trend) {
        switch (trend) {
            case 'up':
            case 'increasing':
                return '↗';
            case 'down':
            case 'decreasing':
                return '↘';
            case 'stable':
            case 'same':
            default:
                return '—';
        }
    }
    
    /**
     * Get trend class for styling based on FR-003.5 requirements
     */
    function getTrendClass(trend, drink = null) {
        // If we have drink data, calculate trend based on FR-003.5 logic
        if (drink) {
            const salesPerCycle = drink.sales_count || drink.sales_per_cycle || 0;
            const currentPrice = parseFloat(drink.current_price || 0);
            const minimumPrice = parseFloat(drink.minimum_price || 0);
            
            if (salesPerCycle > 0) {
                // Has sales this cycle → RED up arrow (will increase)
                return 'trend-up';
            } else if (currentPrice > minimumPrice) {
                // No sales and above minimum → GREEN down arrow (will decrease) 
                return 'trend-down';
            } else {
                // No sales and at minimum → flat, no special color
                return 'trend-stable';
            }
        }
        
        // Fallback to legacy trend logic
        switch (trend) {
            case 'up':
            case 'increasing':
                return 'trend-up';
            case 'down':
            case 'decreasing':
                return 'trend-down';
            case 'stable':
            case 'same':
            default:
                return 'trend-stable';
        }
    }
    
    /**
     * Render drinks grid
     */
    function renderDrinks() {
        const drinksGrid = document.getElementById('drinks-grid');
        if (!drinksGrid) return;
        
        if (!drinks || drinks.length === 0) {
            drinksGrid.innerHTML = `
                <div class="loading-state">
                    <p>No drinks available</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        // Render drink buttons
        drinks.forEach((drink, index) => {
            const trendClass = getTrendClass(drink.trend, drink);
            const trendIcon = getTrendIcon(drink.trend, drink);
            
            html += `
                <button class="drink-button sale-button" data-drink-id="${drink.id || index}">
                    <div class="drink-name">${drink.name}</div>
                    <div class="drink-price-section">
                        <div class="drink-price">${formatPrice(drink.current_price)}</div>
                        <div class="drink-trend ${trendClass}">${trendIcon}</div>
                    </div>
                    <div class="sale-hint">Tap to Record Sale</div>
                </button>
            `;
        });
        
        // Add "Add New Drink" button - always available
        html += `
            <button class="add-drink-button" id="add-drink-btn">
                <i class="add-drink-icon fa-solid fa-plus"></i>
                <div class="add-drink-text">Add New Drink</div>
            </button>
        `;
        
        drinksGrid.innerHTML = html;
        
        // Attach event handlers
        attachDrinkEventHandlers();
    }
    
    /**
     * Attach event handlers to drink buttons
     */
    function attachDrinkEventHandlers() {
        // Drink button clicks (for recording sales)
        const drinkButtons = document.querySelectorAll('.drink-button[data-drink-id]');
        drinkButtons.forEach(button => {
            button.addEventListener('click', function() {
                const drinkId = this.getAttribute('data-drink-id');
                recordSale(drinkId);
            });
            
            // Double-click to edit drink (advanced feature)
            button.addEventListener('dblclick', function() {
                const drinkId = this.getAttribute('data-drink-id');
                editDrink(drinkId);
            });
        });
        
        // Add drink button
        const addDrinkBtn = document.getElementById('add-drink-btn');
        if (addDrinkBtn) {
            addDrinkBtn.addEventListener('click', function() {
                addNewDrink();
            });
        }
    }
    
    /**
     * Record a sale for a drink
     */
    async function recordSale(drinkId) {
        try {
            const button = document.querySelector(`[data-drink-id="${drinkId}"].drink-button`);
            if (button) {
                // Add pressed state
                button.classList.add('pressed');
                pressedButtons.add(drinkId);
                
                // Remove pressed state after feedback
                setTimeout(() => {
                    button.classList.remove('pressed');
                    pressedButtons.delete(drinkId);
                }, 200);
            }
            
            console.log(`[AdminPage] Recording sale for drink ${drinkId}`);
            
            if (window.APIClient) {
                const response = await window.APIClient.post(`/api/drinks/${drinkId}/sales`, {});
                if (response.success) {
                    console.log('[AdminPage] Sale recorded successfully');
                    
                    // Show success feedback
                    showNotification('Sale recorded!', 'success');
                    
                    // Refresh drinks data
                    await loadDrinks();
                } else {
                    throw new Error(response.error || 'Failed to record sale');
                }
            }
            
        } catch (error) {
            console.error('[AdminPage] Failed to record sale:', error);
            showNotification('Failed to record sale', 'error');
        }
    }
    
    /**
     * Edit a drink
     */
    function editDrink(drinkId) {
        console.log(`[AdminPage] Edit drink ${drinkId}`);
        openModal('edit-drink', { drinkId });
    }
    
    /**
     * Add a new drink
     */
    function addNewDrink() {
        console.log('[AdminPage] Add new drink');
        openModal('add-drink');
    }
    
    /**
     * Open a modal
     */
    function openModal(modalType, data = {}) {
        if (window.ModalManager) {
            // Add current drinks data for drink-list modal
            if (modalType === 'drink-list') {
                data.drinks = drinks;
            }
            
            // Add drink data for edit-drink modal
            if (modalType === 'edit-drink' && data.drinkId) {
                const drink = drinks.find(d => d.id == data.drinkId || drinks.indexOf(d) == data.drinkId);
                if (drink) {
                    data.drink = drink;
                }
            }
            
            // Add settings data for app-settings modal
            if (modalType === 'app-settings') {
                loadAppSettings().then(settings => {
                    data.settings = settings;
                    window.ModalManager.open(modalType, data);
                }).catch(error => {
                    console.error('Failed to load app settings:', error);
                    data.settings = {
                        refresh_cycle: 300,
                        auto_start: true,
                        backup_interval: 24,
                        max_backups: 10
                    };
                    window.ModalManager.open(modalType, data);
                });
                return; // Exit early to wait for async load
            }
            
            // Add backups data for backups modal
            if (modalType === 'backups') {
                loadBackupsData().then(backupsInfo => {
                    data.backups = backupsInfo.backups;
                    data.lastBackup = backupsInfo.lastBackup;
                    window.ModalManager.open(modalType, data);
                }).catch(error => {
                    console.error('Failed to load backups data:', error);
                    data.backups = [];
                    data.lastBackup = 'Error loading backup data';
                    window.ModalManager.open(modalType, data);
                });
                return; // Exit early to wait for async load
            }
            
            
            window.ModalManager.open(modalType, data);
        } else {
            console.log(`[AdminPage] Modal ${modalType} requested (modal manager not available)`);
        }
    }
    
    /**
     * Show notification
     */
    function showNotification(message, type = 'info') {
        if (window.StateManager) {
            window.StateManager.addNotification(type, message);
        } else {
            console.log(`[AdminPage] ${type.toUpperCase()}: ${message}`);
        }
    }
    
    /**
     * Handle WebSocket price updates
     */
    function handlePriceUpdate(data) {
        console.log('[AdminPage] Price update received:', data);
        
        if (data && data.drinks) {
            updateDrinks(data.drinks);
        }
    }
    
    /**
     * Handle WebSocket connection status
     */
    function handleConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            // Keep element empty for small oval effect, just update CSS class
            statusElement.textContent = '';
            statusElement.className = connected ? 'connection-status connected' : 'connection-status disconnected';
        }
    }
    
    /**
     * Update drinks data
     */
    function updateDrinks(newDrinks) {
        drinks = newDrinks;
        renderDrinks();
    }
    
    /**
     * Load drinks from API
     */
    async function loadDrinks() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/drinks');
                if (response.success && response.data) {
                    updateDrinks(response.data);
                }
            }
        } catch (error) {
            console.error('[AdminPage] Failed to load drinks:', error);
            
            // Show fallback content
            updateDrinks([
                { id: 1, name: 'Beer', current_price: 5.50, trend: 'up' },
                { id: 2, name: 'Wine', current_price: 8.00, trend: 'stable' },
                { id: 3, name: 'Cocktail', current_price: 12.00, trend: 'down' },
                { id: 4, name: 'Spirits', current_price: 10.00, trend: 'stable' }
            ]);
        }
    }
    
    /**
     * Load app settings from API
     */
    async function loadAppSettings() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/settings');
                if (response.success && response.data) {
                    return response.data;
                }
            }
        } catch (error) {
            console.error('[AdminPage] Failed to load app settings:', error);
        }
        
        // Return defaults if API call fails
        return {
            refresh_cycle: 30,
            auto_start: true,
            backup_interval: 24,
            max_backups: 10
        };
    }
    
    /**
     * Load backups data from API
     */
    async function loadBackupsData() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/backups');
                if (response.success && response.data) {
                    // Handle case where data is an array (direct backup list)
                    const backups = Array.isArray(response.data) ? response.data : (response.data.backups || []);
                    const lastBackup = response.data.last_backup || (backups.length > 0 ? backups[0].created || backups[0].name : 'Never');
                    
                    return {
                        backups: backups,
                        lastBackup: lastBackup
                    };
                }
            }
        } catch (error) {
            console.error('[AdminPage] Failed to load backups data:', error);
        }
        
        // Return empty if API call fails
        return {
            backups: [],
            lastBackup: 'Error loading backup data'
        };
    }
    
    /**
     * Setup WebSocket event handlers
     */
    function setupWebSocketHandlers() {
        if (!window.WebSocketClient) return;
        
        // Subscribe to price updates
        const priceUpdateUnsub = window.WebSocketClient.onPriceUpdate(handlePriceUpdate);
        websocketUnsubscribers.push(priceUpdateUnsub);
        
        // Subscribe to connection events
        const connectUnsub = window.WebSocketClient.on('connected', () => {
            handleConnectionStatus(true);
        });
        websocketUnsubscribers.push(connectUnsub);
        
        const disconnectUnsub = window.WebSocketClient.on('disconnected', () => {
            handleConnectionStatus(false);
        });
        websocketUnsubscribers.push(disconnectUnsub);
    }
    
    /**
     * Setup state manager subscriptions
     */
    function setupStateSubscriptions() {
        if (!window.StateManager) return;
        
        // Subscribe to drinks updates
        const drinksUnsub = window.StateManager.subscribe('drinks', (newDrinks) => {
            if (newDrinks && Array.isArray(newDrinks)) {
                updateDrinks(newDrinks);
            }
        });
        stateUnsubscribers.push(drinksUnsub);
        
        // Subscribe to connection status
        const connectionUnsub = window.StateManager.subscribe('realtime.connected', (connected) => {
            handleConnectionStatus(connected);
        });
        stateUnsubscribers.push(connectionUnsub);
    }
    
    /**
     * Setup settings button handlers
     */
    function setupSettingsHandlers() {
        // Edit Drink List button
        const editDrinkListBtn = document.getElementById('edit-drink-list-btn');
        if (editDrinkListBtn) {
            editDrinkListBtn.addEventListener('click', function() {
                openModal('drink-list');
            });
        }
        
        // App Settings button
        const appSettingsBtn = document.getElementById('app-settings-btn');
        if (appSettingsBtn) {
            appSettingsBtn.addEventListener('click', function() {
                openModal('app-settings');
            });
        }
        
        // Backups button
        const backupsBtn = document.getElementById('backups-btn');
        if (backupsBtn) {
            backupsBtn.addEventListener('click', function() {
                openModal('backups');
            });
        }
        
    }
    
    /**
     * Cleanup function
     */
    function cleanup() {
        // Clear WebSocket subscriptions
        websocketUnsubscribers.forEach(unsub => unsub());
        websocketUnsubscribers = [];
        
        // Clear state subscriptions
        stateUnsubscribers.forEach(unsub => unsub());
        stateUnsubscribers = [];
        
        // Clear pressed buttons
        pressedButtons.clear();
    }
    
    // Auto-cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
    // Public API
    return {
        /**
         * Initialize admin page
         */
        init: async function() {
            if (isInitialized) {
                console.log('[AdminPage] Already initialized');
                return;
            }
            
            console.log('[AdminPage] Initializing...');
            
            try {
                // Initialize core components
                if (window.StateManager) {
                    window.StateManager.init();
                }
                
                if (window.WebSocketClient) {
                    await window.WebSocketClient.init();
                }
                
                if (window.ModalManager) {
                    window.ModalManager.init();
                }
                
                // Setup event handlers
                setupWebSocketHandlers();
                setupStateSubscriptions();
                setupSettingsHandlers();
                
                // Load initial data
                await loadDrinks();
                
                // Set initial connection status
                const connected = window.WebSocketClient ? window.WebSocketClient.isConnected() : false;
                handleConnectionStatus(connected);
                
                isInitialized = true;
                console.log('[AdminPage] Initialized successfully');
                
            } catch (error) {
                console.error('[AdminPage] Initialization failed:', error);
                
                // Show fallback content even if initialization fails
                this.showFallbackContent();
            }
        },
        
        /**
         * Show fallback content when systems are unavailable
         */
        showFallbackContent: function() {
            updateDrinks([
                { id: 1, name: 'Beer', current_price: 5.50, trend: 'up' },
                { id: 2, name: 'Wine', current_price: 8.00, trend: 'stable' },
                { id: 3, name: 'Cocktail', current_price: 12.00, trend: 'down' },
                { id: 4, name: 'Spirits', current_price: 10.00, trend: 'stable' }
            ]);
        },
        
        /**
         * Manually refresh data
         */
        refresh: async function() {
            await loadDrinks();
        },
        
        /**
         * Get current drinks data
         */
        getDrinks: function() {
            return [...drinks];
        },
        
        /**
         * Record sale for drink (public API)
         */
        recordSale: function(drinkId) {
            return recordSale(drinkId);
        },
        
        /**
         * Open modal (public API)
         */
        openModal: function(modalType, data = {}) {
            return openModal(modalType, data);
        },
        
        /**
         * Load backups data (public API)
         */
        loadBackupsData: function() {
            return loadBackupsData();
        },
        
        /**
         * Cleanup resources
         */
        destroy: function() {
            cleanup();
            isInitialized = false;
        }
    };
})();