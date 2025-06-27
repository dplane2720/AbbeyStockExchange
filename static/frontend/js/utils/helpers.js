/**
 * Abbey Stock Exchange v5 - Utility Helpers
 * 
 * Comprehensive utility functions for common operations,
 * DOM manipulation, formatting, validation, and more.
 */

window.AbbeyUtils = (function() {
    'use strict';
    
    return {
        /**
         * Formatting utilities
         */
        format: {
            /**
             * Format price for display
             * @param {number} price - Price value
             * @returns {string} Formatted price string
             */
            price: function(price) {
                if (typeof price !== 'number' || isNaN(price)) {
                    return '$0.00';
                }
                return `$${parseFloat(price).toFixed(2)}`;
            },
            
            /**
             * Format time for countdown display
             * @param {number} seconds - Seconds remaining
             * @returns {string} Formatted time string (MM:SS)
             */
            time: function(seconds) {
                if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
                    return '00:00';
                }
                
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = Math.floor(seconds % 60);
                return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
            },
            
            /**
             * Format duration in human readable format
             * @param {number} seconds - Duration in seconds
             * @returns {string} Formatted duration
             */
            duration: function(seconds) {
                if (typeof seconds !== 'number' || isNaN(seconds)) {
                    return '0 seconds';
                }
                
                const units = [
                    { name: 'day', value: 86400 },
                    { name: 'hour', value: 3600 },
                    { name: 'minute', value: 60 },
                    { name: 'second', value: 1 }
                ];
                
                for (const unit of units) {
                    if (seconds >= unit.value) {
                        const count = Math.floor(seconds / unit.value);
                        return `${count} ${unit.name}${count !== 1 ? 's' : ''}`;
                    }
                }
                
                return '0 seconds';
            },
            
            /**
             * Format date/time
             * @param {Date|string} date - Date to format
             * @param {Object} options - Formatting options
             * @returns {string} Formatted date string
             */
            date: function(date, options = {}) {
                try {
                    const d = typeof date === 'string' ? new Date(date) : date;
                    
                    const defaultOptions = {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    };
                    
                    return d.toLocaleDateString('en-US', { ...defaultOptions, ...options });
                } catch (error) {
                    return 'Invalid date';
                }
            },
            
            /**
             * Format file size
             * @param {number} bytes - Size in bytes
             * @returns {string} Formatted size string
             */
            fileSize: function(bytes) {
                if (typeof bytes !== 'number' || isNaN(bytes)) {
                    return '0 B';
                }
                
                const units = ['B', 'KB', 'MB', 'GB'];
                let size = bytes;
                let unitIndex = 0;
                
                while (size >= 1024 && unitIndex < units.length - 1) {
                    size /= 1024;
                    unitIndex++;
                }
                
                return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
            },
            
            /**
             * Format number with separators
             * @param {number} num - Number to format
             * @returns {string} Formatted number
             */
            number: function(num) {
                if (typeof num !== 'number' || isNaN(num)) {
                    return '0';
                }
                return num.toLocaleString();
            }
        },
        
        /**
         * DOM manipulation utilities
         */
        dom: {
            /**
             * Get element by ID or return element if already an element
             * @param {string|HTMLElement} elementOrId - Element or ID
             * @returns {HTMLElement|null} DOM element
             */
            get: function(elementOrId) {
                if (typeof elementOrId === 'string') {
                    return document.getElementById(elementOrId);
                }
                return elementOrId instanceof HTMLElement ? elementOrId : null;
            },
            
            /**
             * Query selector with optional parent element
             * @param {string} selector - CSS selector
             * @param {HTMLElement} parent - Parent element
             * @returns {HTMLElement|null} DOM element
             */
            query: function(selector, parent = document) {
                return parent.querySelector(selector);
            },
            
            /**
             * Query all elements matching selector
             * @param {string} selector - CSS selector
             * @param {HTMLElement} parent - Parent element
             * @returns {NodeList} DOM elements
             */
            queryAll: function(selector, parent = document) {
                return parent.querySelectorAll(selector);
            },
            
            /**
             * Create element with attributes and content
             * @param {string} tagName - Tag name
             * @param {Object} attributes - Element attributes
             * @param {string|HTMLElement} content - Element content
             * @returns {HTMLElement} Created element
             */
            create: function(tagName, attributes = {}, content = '') {
                const element = document.createElement(tagName);
                
                Object.entries(attributes).forEach(([key, value]) => {
                    if (key === 'class') {
                        element.className = value;
                    } else if (key === 'data') {
                        Object.entries(value).forEach(([dataKey, dataValue]) => {
                            element.dataset[dataKey] = dataValue;
                        });
                    } else {
                        element.setAttribute(key, value);
                    }
                });
                
                if (typeof content === 'string') {
                    element.innerHTML = content;
                } else if (content instanceof HTMLElement) {
                    element.appendChild(content);
                }
                
                return element;
            },
            
            /**
             * Show element
             * @param {HTMLElement|string} elementOrId - Element or ID
             */
            show: function(elementOrId) {
                const element = this.get(elementOrId);
                if (element) {
                    element.style.display = '';
                    element.hidden = false;
                }
            },
            
            /**
             * Hide element
             * @param {HTMLElement|string} elementOrId - Element or ID
             */
            hide: function(elementOrId) {
                const element = this.get(elementOrId);
                if (element) {
                    element.style.display = 'none';
                }
            },
            
            /**
             * Toggle element visibility
             * @param {HTMLElement|string} elementOrId - Element or ID
             */
            toggle: function(elementOrId) {
                const element = this.get(elementOrId);
                if (element) {
                    if (element.style.display === 'none') {
                        this.show(element);
                    } else {
                        this.hide(element);
                    }
                }
            },
            
            /**
             * Add CSS class
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} className - Class name
             */
            addClass: function(elementOrId, className) {
                const element = this.get(elementOrId);
                if (element) {
                    element.classList.add(className);
                }
            },
            
            /**
             * Remove CSS class
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} className - Class name
             */
            removeClass: function(elementOrId, className) {
                const element = this.get(elementOrId);
                if (element) {
                    element.classList.remove(className);
                }
            },
            
            /**
             * Toggle CSS class
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} className - Class name
             */
            toggleClass: function(elementOrId, className) {
                const element = this.get(elementOrId);
                if (element) {
                    element.classList.toggle(className);
                }
            },
            
            /**
             * Check if element has CSS class
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} className - Class name
             * @returns {boolean} Whether element has class
             */
            hasClass: function(elementOrId, className) {
                const element = this.get(elementOrId);
                return element ? element.classList.contains(className) : false;
            }
        },
        
        /**
         * Event handling utilities
         */
        events: {
            /**
             * Add event listener with optional delegation
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} eventType - Event type
             * @param {Function} handler - Event handler
             * @param {string} selector - Delegation selector
             */
            on: function(elementOrId, eventType, handler, selector = null) {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (!element) return;
                
                if (selector) {
                    // Event delegation
                    element.addEventListener(eventType, function(event) {
                        if (event.target.matches(selector)) {
                            handler.call(event.target, event);
                        }
                    });
                } else {
                    element.addEventListener(eventType, handler);
                }
            },
            
            /**
             * Remove event listener
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} eventType - Event type
             * @param {Function} handler - Event handler
             */
            off: function(elementOrId, eventType, handler) {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    element.removeEventListener(eventType, handler);
                }
            },
            
            /**
             * Trigger custom event
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} eventType - Event type
             * @param {*} detail - Event detail
             */
            trigger: function(elementOrId, eventType, detail = null) {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    const event = new CustomEvent(eventType, { detail });
                    element.dispatchEvent(event);
                }
            }
        },
        
        /**
         * Validation utilities
         */
        validate: {
            /**
             * Check if value is empty
             * @param {*} value - Value to check
             * @returns {boolean} Whether value is empty
             */
            isEmpty: function(value) {
                return value === null || value === undefined || value === '' ||
                       (Array.isArray(value) && value.length === 0) ||
                       (typeof value === 'object' && Object.keys(value).length === 0);
            },
            
            /**
             * Validate email format
             * @param {string} email - Email to validate
             * @returns {boolean} Whether email is valid
             */
            email: function(email) {
                const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return pattern.test(email);
            },
            
            /**
             * Validate number within range
             * @param {number} value - Value to validate
             * @param {number} min - Minimum value
             * @param {number} max - Maximum value
             * @returns {boolean} Whether value is in range
             */
            numberInRange: function(value, min, max) {
                const num = parseFloat(value);
                return !isNaN(num) && num >= min && num <= max;
            },
            
            /**
             * Validate required fields in object
             * @param {Object} obj - Object to validate
             * @param {Array} requiredFields - Required field names
             * @returns {Array} Array of missing field names
             */
            requiredFields: function(obj, requiredFields) {
                return requiredFields.filter(field => this.isEmpty(obj[field]));
            }
        },
        
        /**
         * Performance utilities
         */
        performance: {
            /**
             * Debounce function to limit function calls
             * @param {Function} func - Function to debounce
             * @param {number} wait - Wait time in milliseconds
             * @returns {Function} Debounced function
             */
            debounce: function(func, wait) {
                let timeout;
                return function executedFunction(...args) {
                    const later = () => {
                        clearTimeout(timeout);
                        func(...args);
                    };
                    clearTimeout(timeout);
                    timeout = setTimeout(later, wait);
                };
            },
            
            /**
             * Throttle function to limit function calls
             * @param {Function} func - Function to throttle
             * @param {number} limit - Time limit in milliseconds
             * @returns {Function} Throttled function
             */
            throttle: function(func, limit) {
                let inThrottle;
                return function(...args) {
                    if (!inThrottle) {
                        func.apply(this, args);
                        inThrottle = true;
                        setTimeout(() => inThrottle = false, limit);
                    }
                };
            },
            
            /**
             * Request animation frame with fallback
             * @param {Function} callback - Animation callback
             * @returns {number} Animation frame ID
             */
            requestAnimFrame: function(callback) {
                return (window.requestAnimationFrame ||
                        window.webkitRequestAnimationFrame ||
                        window.mozRequestAnimationFrame ||
                        function(callback) {
                            return window.setTimeout(callback, 1000 / 60);
                        })(callback);
            }
        },
        
        /**
         * State management utilities
         */
        state: {
            /**
             * Show loading state
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} message - Loading message
             */
            showLoading: function(elementOrId, message = 'Loading...') {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    element.innerHTML = `<div class="loading-state">
                        <div class="loading-spinner"></div>
                        <div class="loading-message">${message}</div>
                    </div>`;
                    window.AbbeyUtils.dom.addClass(element, 'loading');
                }
            },
            
            /**
             * Show error state
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} message - Error message
             * @param {Function} retryCallback - Retry callback
             */
            showError: function(elementOrId, message, retryCallback = null) {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    const retryButton = retryCallback ? 
                        `<button class="retry-button" onclick="${retryCallback.name}()">Retry</button>` : '';
                    
                    element.innerHTML = `<div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <div class="error-message">${message}</div>
                        ${retryButton}
                    </div>`;
                    window.AbbeyUtils.dom.addClass(element, 'error');
                }
            },
            
            /**
             * Show empty state
             * @param {HTMLElement|string} elementOrId - Element or ID
             * @param {string} message - Empty state message
             */
            showEmpty: function(elementOrId, message = 'No data available') {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    element.innerHTML = `<div class="empty-state">
                        <div class="empty-icon">📭</div>
                        <div class="empty-message">${message}</div>
                    </div>`;
                    window.AbbeyUtils.dom.addClass(element, 'empty');
                }
            },
            
            /**
             * Clear state classes
             * @param {HTMLElement|string} elementOrId - Element or ID
             */
            clearState: function(elementOrId) {
                const element = window.AbbeyUtils.dom.get(elementOrId);
                if (element) {
                    window.AbbeyUtils.dom.removeClass(element, 'loading');
                    window.AbbeyUtils.dom.removeClass(element, 'error');
                    window.AbbeyUtils.dom.removeClass(element, 'empty');
                }
            }
        },
        
        /**
         * Data utilities
         */
        data: {
            /**
             * Deep clone object
             * @param {*} obj - Object to clone
             * @returns {*} Cloned object
             */
            clone: function(obj) {
                if (obj === null || typeof obj !== 'object') {
                    return obj;
                }
                
                if (obj instanceof Date) {
                    return new Date(obj.getTime());
                }
                
                if (Array.isArray(obj)) {
                    return obj.map(item => this.clone(item));
                }
                
                const cloned = {};
                Object.keys(obj).forEach(key => {
                    cloned[key] = this.clone(obj[key]);
                });
                
                return cloned;
            },
            
            /**
             * Deep merge objects
             * @param {Object} target - Target object
             * @param {...Object} sources - Source objects
             * @returns {Object} Merged object
             */
            merge: function(target, ...sources) {
                if (!sources.length) return target;
                const source = sources.shift();
                
                if (this.isObject(target) && this.isObject(source)) {
                    Object.keys(source).forEach(key => {
                        if (this.isObject(source[key])) {
                            if (!target[key]) Object.assign(target, { [key]: {} });
                            this.merge(target[key], source[key]);
                        } else {
                            Object.assign(target, { [key]: source[key] });
                        }
                    });
                }
                
                return this.merge(target, ...sources);
            },
            
            /**
             * Check if value is object
             * @param {*} item - Item to check
             * @returns {boolean} Whether item is object
             */
            isObject: function(item) {
                return item && typeof item === 'object' && !Array.isArray(item);
            },
            
            /**
             * Generate unique ID
             * @returns {string} Unique ID
             */
            generateId: function() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2);
            }
        },
        
        /**
         * URL utilities
         */
        url: {
            /**
             * Get URL parameter
             * @param {string} name - Parameter name
             * @returns {string|null} Parameter value
             */
            getParam: function(name) {
                const urlParams = new URLSearchParams(window.location.search);
                return urlParams.get(name);
            },
            
            /**
             * Set URL parameter
             * @param {string} name - Parameter name
             * @param {string} value - Parameter value
             */
            setParam: function(name, value) {
                const url = new URL(window.location);
                url.searchParams.set(name, value);
                window.history.pushState({}, '', url);
            },
            
            /**
             * Remove URL parameter
             * @param {string} name - Parameter name
             */
            removeParam: function(name) {
                const url = new URL(window.location);
                url.searchParams.delete(name);
                window.history.pushState({}, '', url);
            }
        },
        
        /**
         * Storage utilities
         */
        storage: {
            /**
             * Set localStorage item with JSON serialization
             * @param {string} key - Storage key
             * @param {*} value - Value to store
             */
            set: function(key, value) {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                } catch (error) {
                    console.warn('Failed to set localStorage item:', error);
                }
            },
            
            /**
             * Get localStorage item with JSON parsing
             * @param {string} key - Storage key
             * @param {*} defaultValue - Default value if not found
             * @returns {*} Stored value or default
             */
            get: function(key, defaultValue = null) {
                try {
                    const item = localStorage.getItem(key);
                    return item ? JSON.parse(item) : defaultValue;
                } catch (error) {
                    console.warn('Failed to get localStorage item:', error);
                    return defaultValue;
                }
            },
            
            /**
             * Remove localStorage item
             * @param {string} key - Storage key
             */
            remove: function(key) {
                try {
                    localStorage.removeItem(key);
                } catch (error) {
                    console.warn('Failed to remove localStorage item:', error);
                }
            },
            
            /**
             * Clear all localStorage
             */
            clear: function() {
                try {
                    localStorage.clear();
                } catch (error) {
                    console.warn('Failed to clear localStorage:', error);
                }
            }
        },
        
        /**
         * Legacy format functions for backward compatibility
         */
        formatPrice: function(price) {
            return this.format.price(price);
        },
        
        formatTime: function(seconds) {
            return this.format.time(seconds);
        },
        
        debounce: function(func, wait) {
            return this.performance.debounce(func, wait);
        },
        
        showLoading: function(element, message) {
            return this.state.showLoading(element, message);
        },
        
        showError: function(element, message, retryCallback) {
            return this.state.showError(element, message, retryCallback);
        }
    };
})();