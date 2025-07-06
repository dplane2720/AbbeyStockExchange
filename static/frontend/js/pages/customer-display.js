/**
 * Abbey Stock Exchange v5 - Customer Display Page
 * 
 * Manages the customer-facing display with real-time price updates,
 * advanced trend indicators, and synchronized countdown timer.
 */

window.CustomerDisplay = (function() {
    'use strict';
    
    let isInitialized = false;
    let drinks = [];
    let websocketUnsubscribers = [];
    let stateUnsubscribers = [];
    let animationTimeouts = [];
    let countdownTimerId = null;
    let footerTimerId = null;
    let pollingInterval = null;
    let pollingEnabled = false;
    let retryAttempts = 0;
    let maxRetryAttempts = 5;
    let connectionStatusTimeouts = [];
    let fallbackMode = false;
    let timerState = {
        timeRemaining: 0,
        refreshCycle: 30,
        lastSync: null,
        isRunning: false
    };
    
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
     * Get trend class for styling
     */
    function getTrendClass(trend) {
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
     * Animate price change
     */
    function animatePriceChange(drinkElement, newPrice, oldPrice) {
        const priceElement = drinkElement.querySelector('.drink-price');
        if (!priceElement) return;
        
        // Add animation class
        priceElement.classList.add('price-changing');
        
        // Remove animation class after animation
        const timeoutId = setTimeout(() => {
            priceElement.classList.remove('price-changing');
        }, 600);
        
        animationTimeouts.push(timeoutId);
    }
    
    /**
     * Animate trend change
     */
    function animateTrendChange(drinkElement, newTrend) {
        const trendElement = drinkElement.querySelector('.drink-trend');
        if (!trendElement) return;
        
        // Add animation class
        trendElement.classList.add('trend-changing');
        
        // Remove animation class after animation
        const timeoutId = setTimeout(() => {
            trendElement.classList.remove('trend-changing');
        }, 800);
        
        animationTimeouts.push(timeoutId);
    }
    
    /**
     * Apply dynamic scaling class based on drink count and layout
     */
    function applyDynamicScaling(displayLayout = 'single-column') {
        const drinksTables = document.querySelectorAll('.drinks-table');
        if (!drinksTables.length) return;
        
        const totalDrinkCount = drinks.length;
        
        drinksTables.forEach((drinksTable, tableIndex) => {
            // For two-column layout, calculate drinks per table
            let drinkCountForTable = totalDrinkCount;
            if (displayLayout === 'two-column') {
                const midPoint = Math.ceil(totalDrinkCount / 2);
                drinkCountForTable = tableIndex === 0 ? midPoint : (totalDrinkCount - midPoint);
            }
            
            // Remove existing scaling classes
            drinksTable.classList.remove('few-drinks', 'normal-drinks', 'many-drinks', 'lots-of-drinks', 'scrollable');
            
            // Apply appropriate scaling class based on drink count per table
            if (drinkCountForTable <= 3) {
                drinksTable.classList.add('few-drinks');
            } else if (drinkCountForTable <= 6) {
                drinksTable.classList.add('normal-drinks');
            } else if (drinkCountForTable <= 10) {
                drinksTable.classList.add('many-drinks');
            } else if (drinkCountForTable <= 15) {
                drinksTable.classList.add('lots-of-drinks');
            } else {
                // Too many drinks, enable scrolling
                drinksTable.classList.add('scrollable');
            }
            
            // Set CSS custom properties for more precise control
            drinksTable.style.setProperty('--drink-count', drinkCountForTable);
            drinksTable.style.setProperty('--total-drink-count', totalDrinkCount);
            drinksTable.style.setProperty('--display-layout', displayLayout);
        });
        
        console.log(`[CustomerDisplay] Applied scaling for ${totalDrinkCount} drinks in ${displayLayout} layout`);
    }
    function renderDrinks() {
        const drinksDisplay = document.getElementById('drinks-display');
        if (!drinksDisplay) return;
        
        if (!drinks || drinks.length === 0) {
            drinksDisplay.innerHTML = `
                <div class="no-drinks">
                    <p>No drinks available</p>
                </div>
            `;
            return;
        }
        
        // Get current settings to determine layout
        const settings = window.StateManager ? window.StateManager.getState('settings') : {};
        const displayLayout = settings.display_layout || 'single-column';
        const fontScale = settings.font_scale || 100;
        
        // Apply font scaling
        applyFontScaling(fontScale);
        
        let html = '';
        
        if (displayLayout === 'two-column' && drinks.length > 1) {
            // Split drinks into two columns
            const midPoint = Math.ceil(drinks.length / 2);
            const leftColumn = drinks.slice(0, midPoint);
            const rightColumn = drinks.slice(midPoint);
            
            html = `
                <div class="drinks-display-container two-column">
                    <div class="drinks-column left-column">
                        ${generateTableHTML(leftColumn, 'left')}
                    </div>
                    <div class="drinks-column right-column">
                        ${generateTableHTML(rightColumn, 'right')}
                    </div>
                </div>
            `;
        } else {
            // Single column layout
            html = `
                <div class="drinks-display-container single-column">
                    ${generateTableHTML(drinks, 'single')}
                </div>
            `;
        }
        
        drinksDisplay.innerHTML = html;
        
        // Apply dynamic scaling based on drink count and layout
        applyDynamicScaling(displayLayout);
    }
    
    /**
     * Generate table HTML for a given set of drinks
     */
    function generateTableHTML(drinksList, columnType) {
        let html = `
            <div class="drinks-table ${columnType}-table">
                <div class="table-header">
                    <div class="header-drink">Beer / Wine</div>
                    <div class="header-price">PRICE</div>
                    <div class="header-trend">TREND</div>
                </div>
                <div class="table-body">
        `;
        
        drinksList.forEach((drink, index) => {
            const trendClass = getTrendClass(drink.trend);
            const trendIcon = getTrendIcon(drink.trend);
            
            html += `
                <div class="drink-row" data-drink-id="${drink.id || index}">
                    <div class="drink-name">${drink.name}</div>
                    <div class="drink-price">${formatPrice(drink.current_price)}</div>
                    <div class="drink-trend ${trendClass}">${trendIcon}</div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }
    
    /**
     * Apply font scaling to the display
     */
    function applyFontScaling(fontScale) {
        const displayElement = document.querySelector('.customer-display');
        if (displayElement) {
            displayElement.style.setProperty('--font-scale-multiplier', fontScale / 100);
        }
    }
    
    /**
     * Update drinks with animation
     */
    function updateDrinks(newDrinks) {
        const oldDrinks = [...drinks];
        drinks = newDrinks;
        
        // Cache drinks data for offline mode
        cacheDrinks(drinks);
        
        // Check for price changes and animate
        drinks.forEach((drink, index) => {
            const oldDrink = oldDrinks.find(d => d.id === drink.id || oldDrinks[index]);
            if (oldDrink) {
                const drinkElement = document.querySelector(`[data-drink-id="${drink.id || index}"]`);
                if (drinkElement) {
                    // Animate price change
                    if (oldDrink.current_price !== drink.current_price) {
                        animatePriceChange(drinkElement, drink.current_price, oldDrink.current_price);
                    }
                    
                    // Animate trend change
                    if (oldDrink.trend !== drink.trend) {
                        animateTrendChange(drinkElement, drink.trend);
                    }
                }
            }
        });
        
        renderDrinks();
    }
    
    /**
     * Handle WebSocket price updates
     */
    function handlePriceUpdate(data) {
        console.log('[CustomerDisplay] Price update received:', data);
        
        if (data && data.drinks) {
            updateDrinks(data.drinks);
            
            // Reset timer when price update is received (trends should be fresh)
            loadTimerStatus().catch(() => {
                console.warn('[CustomerDisplay] Failed to sync timer after price update');
            });
        }
    }
    
    /**
     * Handle WebSocket connection status
     */
    function handleConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (connected) {
                // Keep element empty for small oval effect, just update CSS class
                statusElement.textContent = '';
                statusElement.className = 'connection-status connected';
                retryAttempts = 0;
                
                // Stop polling if WebSocket is back
                if (pollingEnabled && !fallbackMode) {
                    stopPolling();
                }
            } else {
                // Keep element empty for small oval effect, just update CSS class
                statusElement.textContent = '';
                statusElement.className = 'connection-status disconnected';
                
                // Start fallback mechanisms
                handleConnectionLoss();
            }
        }
        
        // Show/hide connection warning banner
        updateConnectionBanner(connected);
    }
    
    /**
     * Handle connection loss with fallback strategies
     */
    function handleConnectionLoss() {
        console.log('[CustomerDisplay] Connection lost, starting fallback strategies');
        
        // Increment retry attempts
        retryAttempts++;
        
        // If we haven't exceeded max retries, try fallback to polling
        if (retryAttempts <= maxRetryAttempts && !pollingEnabled) {
            const delay = Math.min(1000 * Math.pow(2, retryAttempts), 30000); // Exponential backoff
            
            console.log(`[CustomerDisplay] Starting polling fallback in ${delay}ms (attempt ${retryAttempts}/${maxRetryAttempts})`);
            
            const timeoutId = setTimeout(() => {
                startPolling();
            }, delay);
            
            connectionStatusTimeouts.push(timeoutId);
        } else if (retryAttempts > maxRetryAttempts) {
            // Enter complete offline mode
            enterOfflineMode();
        }
    }
    
    /**
     * Start polling fallback for data updates
     */
    function startPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        
        pollingEnabled = true;
        fallbackMode = true;
        
        console.log('[CustomerDisplay] Starting polling fallback');
        
        // Initial poll
        pollForUpdates();
        
        // Set up regular polling interval (every 30 seconds)
        pollingInterval = setInterval(() => {
            pollForUpdates();
        }, 30000);
        
        // Update status - keep element empty for small oval effect
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.className = 'connection-status disconnected';
        }
    }
    
    /**
     * Stop polling fallback
     */
    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        
        pollingEnabled = false;
        fallbackMode = false;
        
        console.log('[CustomerDisplay] Stopped polling fallback');
    }
    
    /**
     * Poll API for updates when WebSocket is unavailable
     */
    async function pollForUpdates() {
        try {
            console.log('[CustomerDisplay] Polling for updates...');
            
            // Poll drinks data
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/drinks');
                if (response.success && response.data) {
                    updateDrinks(response.data);
                }
                
                // Poll system status for timer info
                const statusResponse = await window.APIClient.get('/api/settings/status');
                if (statusResponse.success && statusResponse.data) {
                    if (statusResponse.data.next_refresh) {
                        const now = new Date().getTime();
                        const nextRefresh = new Date(statusResponse.data.next_refresh).getTime();
                        const timeRemaining = Math.max(0, Math.floor((nextRefresh - now) / 1000));
                        updateFooterTimer(timeRemaining);
                    }
                }
            }
            
        } catch (error) {
            console.error('[CustomerDisplay] Polling failed:', error);
            
            // If polling also fails, enter complete offline mode
            if (retryAttempts > maxRetryAttempts) {
                enterOfflineMode();
            }
        }
    }
    
    /**
     * Enter complete offline mode with cached data
     */
    function enterOfflineMode() {
        console.log('[CustomerDisplay] Entering offline mode');
        
        stopPolling();
        
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.className = 'connection-status disconnected';
        }
        
        // Show offline banner
        showOfflineBanner();
        
        // Use cached data or fallback data
        const cachedDrinks = getCachedDrinks();
        if (cachedDrinks && cachedDrinks.length > 0) {
            updateDrinks(cachedDrinks);
        } else {
            // Show fallback content
            showFallbackContent();
        }
        
        // Stop timer updates
        updateFooterTimer(0);
    }
    
    /**
     * Get cached drinks data
     */
    function getCachedDrinks() {
        try {
            return window.AbbeyUtils.storage.get('customer-display-drinks', null);
        } catch (error) {
            console.warn('[CustomerDisplay] Failed to get cached drinks:', error);
            return null;
        }
    }
    
    /**
     * Cache drinks data
     */
    function cacheDrinks(drinksData) {
        try {
            window.AbbeyUtils.storage.set('customer-display-drinks', drinksData);
        } catch (error) {
            console.warn('[CustomerDisplay] Failed to cache drinks:', error);
        }
    }
    
    /**
     * Update connection status banner
     */
    function updateConnectionBanner(connected) {
        let banner = document.getElementById('connection-banner');
        
        if (!connected || fallbackMode) {
            // Show banner
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'connection-banner';
                banner.className = 'connection-banner';
                
                const customerDisplay = document.querySelector('.customer-display');
                if (customerDisplay) {
                    customerDisplay.insertBefore(banner, customerDisplay.firstChild);
                }
            }
            
            if (fallbackMode) {
                banner.innerHTML = `
                    <div class="banner-content">
                        <span class="banner-icon">⚠️</span>
                        <span class="banner-message">Using fallback mode - prices may not be real-time</span>
                        <button class="banner-retry" onclick="window.CustomerDisplay.retry()">Retry Connection</button>
                    </div>
                `;
                banner.className = 'connection-banner warning';
            } else {
                banner.innerHTML = `
                    <div class="banner-content">
                        <span class="banner-icon">❌</span>
                        <span class="banner-message">Connection lost - using cached data</span>
                        <button class="banner-retry" onclick="window.CustomerDisplay.retry()">Retry Connection</button>
                    </div>
                `;
                banner.className = 'connection-banner error';
            }
        } else {
            // Hide banner
            if (banner) {
                banner.remove();
            }
        }
    }
    
    /**
     * Show offline banner
     */
    function showOfflineBanner() {
        updateConnectionBanner(false);
    }
    
    /**
     * Show fallback content when no data is available
     */
    function showFallbackContent() {
        updateDrinks([
            { id: 1, name: 'Beer', current_price: 5.50, trend: 'stable' },
            { id: 2, name: 'Wine', current_price: 8.00, trend: 'stable' },
            { id: 3, name: 'Cocktail', current_price: 12.00, trend: 'stable' },
            { id: 4, name: 'Spirits', current_price: 10.00, trend: 'stable' }
        ]);
        
        // Add fallback message
        const drinksDisplay = document.getElementById('drinks-display');
        if (drinksDisplay) {
            const fallbackMessage = document.createElement('div');
            fallbackMessage.className = 'fallback-message';
            fallbackMessage.innerHTML = `
                <p>⚠️ Showing sample prices - actual prices may vary</p>
            `;
            drinksDisplay.appendChild(fallbackMessage);
        }
    }
    
    /**
     * Retry connection manually
     */
    function retryConnection() {
        console.log('[CustomerDisplay] Manual retry connection requested');
        
        // Reset retry counter
        retryAttempts = 0;
        
        // Clear any existing timeouts
        connectionStatusTimeouts.forEach(timeout => clearTimeout(timeout));
        connectionStatusTimeouts = [];
        
        // Stop polling if active
        stopPolling();
        
        // Try to reconnect WebSocket
        if (window.WebSocketClient) {
            window.WebSocketClient.forceReconnect().then(() => {
                console.log('[CustomerDisplay] Manual reconnection successful');
            }).catch(error => {
                console.error('[CustomerDisplay] Manual reconnection failed:', error);
                // Fallback to polling
                startPolling();
            });
        } else {
            // If no WebSocket client, try polling
            startPolling();
        }
    }
    
    /**
     * Handle WebSocket timer updates
     */
    function handleTimerUpdate(data) {
        console.log('[CustomerDisplay] Timer update received:', data);
        
        if (data && typeof data.time_remaining === 'number') {
            // Update timer state with WebSocket data
            timerState.timeRemaining = data.time_remaining;
            timerState.lastSync = Date.now();
            timerState.isRunning = true;
            
            if (data.refresh_cycle) {
                timerState.refreshCycle = data.refresh_cycle;
            }
            
            updateFooterTimer(data.time_remaining);
            cacheTimerState();
            
            // Update countdown timer in header if it exists
            if (countdownTimerId && window.CountdownTimer) {
                window.CountdownTimer.update(countdownTimerId, data.time_remaining);
            }
        }
        
        // Also refresh drinks data to get latest trends
        if (data && data.refresh_cycle) {
            loadInitialData().catch(error => {
                console.warn('[CustomerDisplay] Failed to refresh drinks after timer update:', error);
            });
        }
    }
    
    /**
     * Handle WebSocket settings updates
     */
    function handleSettingsUpdate(data) {
        console.log('[CustomerDisplay] Settings update received:', data);
        
        if (data && data.settings) {
            // Settings are already updated in StateManager by WebSocket client
            // Just need to re-render the display with new settings
            console.log('[CustomerDisplay] Applying settings update automatically:', Object.keys(data.settings));
            
            // Re-render drinks with new layout and font settings
            renderDrinks();
            
            // Log successful automatic update
            console.log('[CustomerDisplay] Display automatically updated with new settings');
        }
    }
    
    /**
     * Update footer timer display
     */
    function updateFooterTimer(timeRemaining) {
        const footerTimerDisplay = document.getElementById('footer-timer-display');
        if (footerTimerDisplay) {
            const formattedTime = window.AbbeyUtils.formatTime(timeRemaining);
            footerTimerDisplay.textContent = formattedTime;
            
            // Add visual states based on time remaining
            const footerTimer = document.getElementById('footer-timer');
            if (footerTimer) {
                footerTimer.classList.remove('warning', 'critical');
                
                if (timeRemaining <= 10) {
                    footerTimer.classList.add('critical');
                } else if (timeRemaining <= 30) {
                    footerTimer.classList.add('warning');
                }
            }
        }
    }
    
    /**
     * Initialize countdown timers
     */
    function initializeTimers() {
        // Only use footer timer (header timer removed)
        startFooterTimer();
        
        // Start automatic timer countdown
        startTimerCountdown();
    }
    
    /**
     * Start footer timer with manual countdown
     */
    function startFooterTimer() {
        // Try to load cached timer state first (for page refresh independence)
        const hasCache = loadCachedTimerState();
        
        if (hasCache && timerState.timeRemaining > 0) {
            // Use cached state but sync with server in background
            updateFooterTimer(timerState.timeRemaining);
            console.log('[CustomerDisplay] Using cached timer state:', timerState.timeRemaining);
            
            // Sync with server in background
            loadTimerStatus().catch(() => {
                console.warn('[CustomerDisplay] Server sync failed, continuing with cached timer');
            });
        } else {
            // No valid cache, load from server
            loadTimerStatus().then(() => {
                console.log('[CustomerDisplay] Footer timer initialized with server data');
            }).catch(() => {
                // Fallback to default time only if API fails
                console.warn('[CustomerDisplay] API failed, using default 30s timer');
                resetTimerState(30);
            });
        }
    }
    
    /**
     * Start automatic timer countdown
     */
    function startTimerCountdown() {
        // Clear any existing timer
        if (footerTimerId) {
            clearInterval(footerTimerId);
        }
        
        timerState.isRunning = true;
        
        // Start countdown that uses internal state (simple decrement)
        footerTimerId = setInterval(() => {
            if (timerState.isRunning && timerState.timeRemaining > 0) {
                // Simple decrement - avoid complex elapsed time calculations
                timerState.timeRemaining--;
                timerState.lastSync = Date.now();
                
                updateFooterTimer(timerState.timeRemaining);
                
                // Persist timer state for page refresh independence
                cacheTimerState();
                
                // Log every 10 seconds to avoid console spam
                if (timerState.timeRemaining % 10 === 0) {
                    console.log(`[CustomerDisplay] Timer: ${timerState.timeRemaining}s remaining`);
                }
            } else if (timerState.timeRemaining <= 0) {
                // Timer reached zero, refresh data and reset timer
                console.log('[CustomerDisplay] Timer reached zero, refreshing data');
                timerState.isRunning = false; // Stop the timer
                
                loadInitialData();
                
                // Reset timer by getting fresh status from API
                loadTimerStatus().catch(() => {
                    // Fallback if API fails
                    const settings = window.StateManager ? window.StateManager.getState('settings') : null;
                    const refreshCycle = settings?.refresh_cycle || 30;
                    resetTimerState(refreshCycle);
                    console.log('[CustomerDisplay] Fallback timer reset to:', refreshCycle);
                });
            }
        }, 1000);
    }
    
    /**
     * Reset timer state to a fresh cycle
     */
    function resetTimerState(refreshCycle) {
        timerState.timeRemaining = refreshCycle;
        timerState.refreshCycle = refreshCycle;
        timerState.lastSync = Date.now();
        timerState.isRunning = true;
        updateFooterTimer(timerState.timeRemaining);
        cacheTimerState();
        console.log(`[CustomerDisplay] Timer reset to ${refreshCycle}s and restarted`);
    }
    
    /**
     * Cache timer state for persistence across page refreshes
     */
    function cacheTimerState() {
        try {
            if (window.AbbeyUtils && window.AbbeyUtils.storage) {
                window.AbbeyUtils.storage.set('customer-display-timer', {
                    ...timerState,
                    lastSync: Date.now()
                });
            }
        } catch (error) {
            console.warn('[CustomerDisplay] Failed to cache timer state:', error);
        }
    }
    
    /**
     * Load cached timer state on page load
     */
    function loadCachedTimerState() {
        try {
            if (window.AbbeyUtils && window.AbbeyUtils.storage) {
                const cached = window.AbbeyUtils.storage.get('customer-display-timer', null);
                if (cached && cached.lastSync) {
                    const now = Date.now();
                    const elapsedSeconds = Math.floor((now - cached.lastSync) / 1000);
                    const adjustedTimeRemaining = Math.max(0, cached.timeRemaining - elapsedSeconds);
                    
                    timerState = {
                        timeRemaining: adjustedTimeRemaining,
                        refreshCycle: cached.refreshCycle || 30,
                        lastSync: now,
                        isRunning: cached.isRunning && adjustedTimeRemaining > 0
                    };
                    
                    console.log('[CustomerDisplay] Restored timer state:', timerState);
                    return true;
                }
            }
        } catch (error) {
            console.warn('[CustomerDisplay] Failed to load cached timer state:', error);
        }
        return false;
    }
    
    /**
     * Load timer status from API
     */
    async function loadTimerStatus() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/settings/status');
                if (response.success && response.data) {
                    const refreshCycle = response.data.refresh_cycle || 30; // Use new default
                    const nextRefresh = response.data.next_refresh;
                    
                    console.log('[CustomerDisplay] Loaded timer status:', { refreshCycle, nextRefresh });
                    
                    if (nextRefresh) {
                        const now = new Date().getTime();
                        const nextRefreshTime = new Date(nextRefresh).getTime();
                        const timeRemaining = Math.max(0, Math.floor((nextRefreshTime - now) / 1000));
                        
                        // If timeRemaining is very low (under 5 seconds), use full cycle instead
                        if (timeRemaining < 5) {
                            console.log('[CustomerDisplay] Server time remaining too low, using full cycle');
                            resetTimerState(refreshCycle);
                        } else {
                            // Update timer state with server sync
                            timerState.timeRemaining = timeRemaining;
                            timerState.refreshCycle = refreshCycle;
                            timerState.lastSync = Date.now();
                            timerState.isRunning = true;
                            
                            updateFooterTimer(timeRemaining);
                            cacheTimerState();
                            console.log('[CustomerDisplay] Timer synced with server, remaining time:', timeRemaining);
                        }
                    } else {
                        // No next refresh time, use full cycle
                        resetTimerState(refreshCycle);
                        console.log('[CustomerDisplay] No next refresh time, timer set to full cycle:', refreshCycle);
                    }
                    return true;
                }
            }
            throw new Error('API call failed or returned invalid data');
        } catch (error) {
            console.warn('[CustomerDisplay] Failed to load timer status:', error);
            throw error;
        }
    }
    
    /**
     * Cleanup timers
     */
    function cleanupTimers() {
        if (countdownTimerId && window.CountdownTimer) {
            window.CountdownTimer.destroy(countdownTimerId);
            countdownTimerId = null;
        }
        
        if (footerTimerId) {
            clearInterval(footerTimerId);
            footerTimerId = null;
        }
    }
    
    /**
     * Load current settings from API
     */
    async function loadSettings() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/settings');
                if (response.success && response.data) {
                    // Update state manager with settings
                    if (window.StateManager) {
                        window.StateManager.setState('settings', response.data);
                    }
                    console.log('[CustomerDisplay] Settings loaded:', response.data);
                    return response.data;
                }
            }
        } catch (error) {
            console.error('[CustomerDisplay] Failed to load settings:', error);
        }
        
        // Return defaults if API call fails
        return {
            display_layout: 'single-column',
            font_scale: 100,
            refresh_cycle: 30
        };
    }

    /**
     * Load initial data from API
     */
    async function loadInitialData() {
        try {
            if (window.APIClient) {
                const response = await window.APIClient.get('/api/drinks');
                if (response.success && response.data) {
                    updateDrinks(response.data);
                }
            }
        } catch (error) {
            console.error('[CustomerDisplay] Failed to load initial data:', error);
            
            // Show fallback content
            updateDrinks([
                { id: 1, name: 'Beer', current_price: 5.50, trend: 'up' },
                { id: 2, name: 'Wine', current_price: 8.00, trend: 'stable' },
                { id: 3, name: 'Cocktail', current_price: 12.00, trend: 'down' }
            ]);
        }
    }
    
    /**
     * Setup WebSocket event handlers
     */
    function setupWebSocketHandlers() {
        if (!window.WebSocketClient) return;
        
        // Subscribe to price updates
        const priceUpdateUnsub = window.WebSocketClient.onPriceUpdate(handlePriceUpdate);
        websocketUnsubscribers.push(priceUpdateUnsub);
        
        // Subscribe to refresh timer updates
        const timerUpdateUnsub = window.WebSocketClient.onRefreshTimer(handleTimerUpdate);
        websocketUnsubscribers.push(timerUpdateUnsub);
        
        // Subscribe to settings updates for automatic display refresh
        const settingsUpdateUnsub = window.WebSocketClient.onSettingsUpdate(handleSettingsUpdate);
        websocketUnsubscribers.push(settingsUpdateUnsub);
        
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
        
        // Subscribe to settings changes
        const settingsUnsub = window.StateManager.subscribe('settings', (newSettings) => {
            if (newSettings) {
                console.log('[CustomerDisplay] Settings updated:', newSettings);
                // Re-render drinks with new settings
                renderDrinks();
            }
        });
        stateUnsubscribers.push(settingsUnsub);
        
        // Subscribe to connection status
        const connectionUnsub = window.StateManager.subscribe('realtime.connected', (connected) => {
            handleConnectionStatus(connected);
        });
        stateUnsubscribers.push(connectionUnsub);
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
        
        // Clear animation timeouts
        animationTimeouts.forEach(timeout => clearTimeout(timeout));
        animationTimeouts = [];
        
        // Clear connection status timeouts
        connectionStatusTimeouts.forEach(timeout => clearTimeout(timeout));
        connectionStatusTimeouts = [];
        
        // Stop polling
        stopPolling();
        
        // Cleanup timers
        cleanupTimers();
        
        // Remove connection banner
        const banner = document.getElementById('connection-banner');
        if (banner) {
            banner.remove();
        }
    }
    
    // Auto-cleanup on page unload
    window.addEventListener('beforeunload', cleanup);
    
    // Public API
    return {
        /**
         * Initialize customer display
         */
        init: async function() {
            if (isInitialized) {
                console.log('[CustomerDisplay] Already initialized');
                return;
            }
            
            console.log('[CustomerDisplay] Initializing...');
            
            try {
                // Initialize core components
                if (window.StateManager) {
                    window.StateManager.init();
                }
                
                if (window.WebSocketClient) {
                    await window.WebSocketClient.init();
                }
                
                // Load settings first
                await loadSettings();
                
                // Initialize countdown timers
                initializeTimers();
                
                // Setup event handlers
                setupWebSocketHandlers();
                setupStateSubscriptions();
                
                // Load initial data
                await loadInitialData();
                
                // Set initial connection status
                const connected = window.WebSocketClient ? window.WebSocketClient.isConnected() : false;
                handleConnectionStatus(connected);
                
                isInitialized = true;
                console.log('[CustomerDisplay] Initialized successfully');
                
            } catch (error) {
                console.error('[CustomerDisplay] Initialization failed:', error);
                
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
                { id: 3, name: 'Cocktail', current_price: 12.00, trend: 'down' }
            ]);
        },
        
        /**
         * Manually refresh data
         */
        refresh: async function() {
            await loadInitialData();
        },
        
        /**
         * Get current drinks data
         */
        getDrinks: function() {
            return [...drinks];
        },
        
        /**
         * Cleanup resources
         */
        destroy: function() {
            cleanup();
            isInitialized = false;
        },
        
        /**
         * Retry connection manually
         */
        retry: function() {
            retryConnection();
        },
        
        /**
         * Get connection status
         */
        getConnectionStatus: function() {
            return {
                connected: window.WebSocketClient ? window.WebSocketClient.isConnected() : false,
                fallbackMode: fallbackMode,
                pollingEnabled: pollingEnabled,
                retryAttempts: retryAttempts,
                maxRetryAttempts: maxRetryAttempts
            };
        },
        
        /**
         * Force fallback mode for testing
         */
        forceFallbackMode: function() {
            handleConnectionLoss();
        }
    };
})();