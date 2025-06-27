/**
 * Abbey Stock Exchange v5 - Countdown Timer Component
 * 
 * Displays countdown timer for price refresh cycles with WebSocket
 * synchronization, visual indicators, and audio notifications.
 */

window.CountdownTimer = (function() {
    'use strict';
    
    // Timer instances tracking
    const timerInstances = new Map();
    let globalTimerId = 0;
    
    /**
     * Generate unique timer ID
     */
    function generateTimerId() {
        return `timer-${++globalTimerId}`;
    }
    
    /**
     * Create timer display structure
     */
    function createTimerStructure(element, options) {
        const container = document.createElement('div');
        container.className = 'countdown-timer-container';
        
        // Timer display
        const display = document.createElement('div');
        display.className = 'timer-display';
        
        const timeText = document.createElement('div');
        timeText.className = 'timer-text';
        timeText.textContent = '00:00';
        
        const label = document.createElement('div');
        label.className = 'timer-label';
        label.textContent = options.label || 'Next Price Update';
        
        display.appendChild(timeText);
        display.appendChild(label);
        
        // Progress ring (optional)
        if (options.showProgress) {
            const progressContainer = document.createElement('div');
            progressContainer.className = 'timer-progress';
            
            const progressRing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            progressRing.setAttribute('class', 'progress-ring');
            progressRing.setAttribute('width', '120');
            progressRing.setAttribute('height', '120');
            
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('class', 'progress-ring-circle');
            circle.setAttribute('cx', '60');
            circle.setAttribute('cy', '60');
            circle.setAttribute('r', '54');
            circle.setAttribute('fill', 'transparent');
            circle.setAttribute('stroke-width', '4');
            
            progressRing.appendChild(circle);
            progressContainer.appendChild(progressRing);
            container.appendChild(progressContainer);
        }
        
        container.appendChild(display);
        
        // Status indicator
        const status = document.createElement('div');
        status.className = 'timer-status';
        container.appendChild(status);
        
        // Replace element content
        element.innerHTML = '';
        element.appendChild(container);
        
        return {
            container,
            display,
            timeText,
            label,
            status,
            progressRing: container.querySelector('.progress-ring-circle')
        };
    }
    
    /**
     * Update timer display
     */
    function updateDisplay(instance, timeRemaining) {
        const { elements, options } = instance;
        
        // Format time
        const formattedTime = window.AbbeyUtils.formatTime(timeRemaining);
        elements.timeText.textContent = formattedTime;
        
        // Update progress ring
        if (elements.progressRing && options.totalDuration > 0) {
            const progress = timeRemaining / options.totalDuration;
            const circumference = 2 * Math.PI * 54; // radius = 54
            const offset = circumference * (1 - progress);
            
            elements.progressRing.style.strokeDasharray = circumference;
            elements.progressRing.style.strokeDashoffset = offset;
        }
        
        // Visual states based on time remaining
        const container = elements.container;
        container.classList.remove('warning', 'critical', 'expired');
        
        if (timeRemaining <= 0) {
            container.classList.add('expired');
            elements.status.textContent = 'Updating prices...';
        } else if (timeRemaining <= 10) {
            container.classList.add('critical');
            elements.status.textContent = 'Price update imminent';
        } else if (timeRemaining <= 30) {
            container.classList.add('warning');
            elements.status.textContent = 'Price update soon';
        } else {
            elements.status.textContent = 'System running normally';
        }
        
        // Audio notification
        if (options.audioEnabled && timeRemaining === 5) {
            playNotificationSound(instance);
        }
        
        // Trigger custom event
        const updateEvent = new CustomEvent('timer:update', {
            detail: {
                timeRemaining,
                formattedTime,
                instance
            }
        });
        document.dispatchEvent(updateEvent);
    }
    
    /**
     * Play notification sound
     */
    function playNotificationSound(instance) {
        if (!instance.options.audioEnabled) return;
        
        try {
            const audio = new Audio(instance.options.audioUrl || '/static/audio/bell.wav');
            audio.volume = instance.options.audioVolume || 0.5;
            audio.play().catch(error => {
                console.warn('CountdownTimer: Audio playback failed:', error);
            });
        } catch (error) {
            console.warn('CountdownTimer: Audio creation failed:', error);
        }
    }
    
    /**
     * Start countdown interval
     */
    function startInterval(instance) {
        if (instance.intervalId) {
            clearInterval(instance.intervalId);
        }
        
        instance.intervalId = setInterval(() => {
            if (instance.timeRemaining > 0) {
                instance.timeRemaining--;
                updateDisplay(instance, instance.timeRemaining);
            } else {
                // Timer reached zero
                handleTimerExpiry(instance);
            }
        }, 1000);
    }
    
    /**
     * Stop countdown interval
     */
    function stopInterval(instance) {
        if (instance.intervalId) {
            clearInterval(instance.intervalId);
            instance.intervalId = null;
        }
    }
    
    /**
     * Handle timer expiry
     */
    function handleTimerExpiry(instance) {
        updateDisplay(instance, 0);
        
        // Trigger expiry event
        const expiryEvent = new CustomEvent('timer:expired', {
            detail: { instance }
        });
        document.dispatchEvent(expiryEvent);
        
        // Auto-restart if enabled
        if (instance.options.autoRestart) {
            setTimeout(() => {
                reset(instance.id, instance.options.totalDuration);
                start(instance.id);
            }, 2000);
        }
    }
    
    /**
     * Sync with WebSocket updates
     */
    function syncWithWebSocket(instance) {
        if (!window.WebSocketClient) return;
        
        // Subscribe to timer updates
        const unsubscribe = window.WebSocketClient.onRefreshTimer((data) => {
            if (data.time_remaining !== undefined) {
                instance.timeRemaining = Math.max(0, Math.floor(data.time_remaining));
                instance.options.totalDuration = data.refresh_cycle || instance.options.totalDuration;
                updateDisplay(instance, instance.timeRemaining);
            }
        });
        
        instance.wsUnsubscribe = unsubscribe;
    }
    
    /**
     * Create timer instance
     */
    function createTimer(elementOrId, options = {}) {
        const element = typeof elementOrId === 'string' ? 
            document.getElementById(elementOrId) : elementOrId;
        
        if (!element) {
            throw new Error('CountdownTimer: Element not found');
        }
        
        const defaultOptions = {
            totalDuration: 300, // 5 minutes default
            label: 'Next Price Update',
            showProgress: true,
            audioEnabled: false,
            audioUrl: '/static/audio/bell.wav',
            audioVolume: 0.5,
            autoRestart: false,
            syncWithWebSocket: true,
            showStatus: true
        };
        
        const config = Object.assign({}, defaultOptions, options);
        const timerId = generateTimerId();
        
        // Create display elements
        const elements = createTimerStructure(element, config);
        
        // Create instance
        const instance = {
            id: timerId,
            element,
            elements,
            options: config,
            timeRemaining: config.totalDuration,
            intervalId: null,
            isRunning: false,
            wsUnsubscribe: null
        };
        
        // Store instance
        timerInstances.set(timerId, instance);
        
        // Setup WebSocket sync
        if (config.syncWithWebSocket) {
            syncWithWebSocket(instance);
        }
        
        // Initial display update
        updateDisplay(instance, instance.timeRemaining);
        
        return timerId;
    }
    
    /**
     * Start timer
     */
    function start(timerId) {
        const instance = timerInstances.get(timerId);
        if (!instance) return false;
        
        if (instance.isRunning) return true;
        
        instance.isRunning = true;
        startInterval(instance);
        
        // Trigger start event
        const startEvent = new CustomEvent('timer:start', {
            detail: { instance }
        });
        document.dispatchEvent(startEvent);
        
        return true;
    }
    
    /**
     * Stop timer
     */
    function stop(timerId) {
        const instance = timerInstances.get(timerId);
        if (!instance) return false;
        
        instance.isRunning = false;
        stopInterval(instance);
        
        // Trigger stop event
        const stopEvent = new CustomEvent('timer:stop', {
            detail: { instance }
        });
        document.dispatchEvent(stopEvent);
        
        return true;
    }
    
    /**
     * Reset timer
     */
    function reset(timerId, newDuration = null) {
        const instance = timerInstances.get(timerId);
        if (!instance) return false;
        
        const wasRunning = instance.isRunning;
        
        // Stop if running
        if (wasRunning) {
            stop(timerId);
        }
        
        // Reset time
        if (newDuration !== null) {
            instance.options.totalDuration = newDuration;
        }
        instance.timeRemaining = instance.options.totalDuration;
        
        // Update display
        updateDisplay(instance, instance.timeRemaining);
        
        // Restart if it was running
        if (wasRunning) {
            start(timerId);
        }
        
        // Trigger reset event
        const resetEvent = new CustomEvent('timer:reset', {
            detail: { instance }
        });
        document.dispatchEvent(resetEvent);
        
        return true;
    }
    
    /**
     * Update timer configuration
     */
    function configure(timerId, options) {
        const instance = timerInstances.get(timerId);
        if (!instance) return false;
        
        Object.assign(instance.options, options);
        
        // Update display if needed
        if (options.label) {
            instance.elements.label.textContent = options.label;
        }
        
        return true;
    }
    
    /**
     * Destroy timer instance
     */
    function destroy(timerId) {
        const instance = timerInstances.get(timerId);
        if (!instance) return false;
        
        // Stop timer
        stop(timerId);
        
        // Clean up WebSocket subscription
        if (instance.wsUnsubscribe) {
            instance.wsUnsubscribe();
        }
        
        // Remove from DOM
        if (instance.element) {
            instance.element.innerHTML = '';
        }
        
        // Remove instance
        timerInstances.delete(timerId);
        
        return true;
    }
    
    // Public API
    return {
        /**
         * Create and initialize countdown timer
         * @param {string|HTMLElement} elementOrId - Element or element ID
         * @param {Object} options - Timer configuration
         * @returns {string} Timer ID
         */
        create: createTimer,
        
        /**
         * Initialize countdown timer (legacy method)
         * @param {string} elementId - Timer element ID
         * @param {Object} options - Timer configuration
         * @returns {string} Timer ID
         */
        init: function(elementId, options = {}) {
            return createTimer(elementId, options);
        },
        
        /**
         * Start timer
         * @param {string} timerId - Timer ID
         * @returns {boolean} Success status
         */
        start: start,
        
        /**
         * Stop timer
         * @param {string} timerId - Timer ID
         * @returns {boolean} Success status
         */
        stop: stop,
        
        /**
         * Reset timer
         * @param {string} timerId - Timer ID
         * @param {number} newDuration - New duration in seconds
         * @returns {boolean} Success status
         */
        reset: reset,
        
        /**
         * Update timer display manually
         * @param {string} timerId - Timer ID
         * @param {number} seconds - Seconds remaining
         * @returns {boolean} Success status
         */
        update: function(timerId, seconds) {
            const instance = timerInstances.get(timerId);
            if (!instance) return false;
            
            instance.timeRemaining = Math.max(0, seconds);
            updateDisplay(instance, instance.timeRemaining);
            return true;
        },
        
        /**
         * Configure timer options
         * @param {string} timerId - Timer ID
         * @param {Object} options - New options
         * @returns {boolean} Success status
         */
        configure: configure,
        
        /**
         * Get timer instance
         * @param {string} timerId - Timer ID
         * @returns {Object|null} Timer instance
         */
        getInstance: function(timerId) {
            return timerInstances.get(timerId) || null;
        },
        
        /**
         * Get timer status
         * @param {string} timerId - Timer ID
         * @returns {Object|null} Timer status
         */
        getStatus: function(timerId) {
            const instance = timerInstances.get(timerId);
            if (!instance) return null;
            
            return {
                id: timerId,
                isRunning: instance.isRunning,
                timeRemaining: instance.timeRemaining,
                totalDuration: instance.options.totalDuration,
                progress: instance.timeRemaining / instance.options.totalDuration
            };
        },
        
        /**
         * Get all timer instances
         * @returns {Array} Array of timer IDs
         */
        getAllTimers: function() {
            return Array.from(timerInstances.keys());
        },
        
        /**
         * Destroy timer
         * @param {string} timerId - Timer ID
         * @returns {boolean} Success status
         */
        destroy: destroy,
        
        /**
         * Destroy all timers
         */
        destroyAll: function() {
            const timerIds = Array.from(timerInstances.keys());
            timerIds.forEach(id => destroy(id));
        },
        
        /**
         * Sync all timers with WebSocket
         */
        syncAll: function() {
            timerInstances.forEach(instance => {
                if (instance.options.syncWithWebSocket) {
                    syncWithWebSocket(instance);
                }
            });
        },
        
        /**
         * Enable/disable audio for all timers
         * @param {boolean} enabled - Audio enabled state
         */
        setGlobalAudio: function(enabled) {
            timerInstances.forEach(instance => {
                instance.options.audioEnabled = enabled;
            });
        },
        
        /**
         * Set global audio volume
         * @param {number} volume - Volume (0-1)
         */
        setGlobalVolume: function(volume) {
            const clampedVolume = Math.max(0, Math.min(1, volume));
            timerInstances.forEach(instance => {
                instance.options.audioVolume = clampedVolume;
            });
        },
        
        /**
         * Format time utility
         * @param {number} seconds - Seconds to format
         * @returns {string} Formatted time string
         */
        formatTime: function(seconds) {
            return window.AbbeyUtils.formatTime(seconds);
        }
    };
})();