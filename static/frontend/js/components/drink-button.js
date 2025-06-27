/**
 * Abbey Stock Exchange v5 - Drink Button Component
 * 
 * Touch-optimized buttons for recording drink sales with real-time
 * price updates, trend indicators, and comprehensive interaction feedback.
 */

window.DrinkButton = (function() {
    'use strict';
    
    // Component state tracking
    const buttonInstances = new Map();
    let componentId = 0;
    
    /**
     * Generate unique component ID
     */
    function generateId() {
        return `drink-button-${++componentId}`;
    }
    
    /**
     * Create trend indicator element
     */
    function createTrendIndicator(trend) {
        const indicator = document.createElement('div');
        indicator.className = 'trend-indicator';
        
        let icon = '→';
        let className = 'stable';
        
        switch (trend) {
            case 'up':
                icon = '↗';
                className = 'trending-up';
                break;
            case 'down':
                icon = '↘';
                className = 'trending-down';
                break;
            default:
                icon = '→';
                className = 'stable';
        }
        
        indicator.innerHTML = `<span class="trend-icon ${className}">${icon}</span>`;
        return indicator;
    }
    
    /**
     * Create loading overlay
     */
    function createLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'button-loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">Processing...</div>
        `;
        return overlay;
    }
    
    /**
     * Create success feedback
     */
    function createSuccessFeedback() {
        const feedback = document.createElement('div');
        feedback.className = 'button-success-feedback';
        feedback.innerHTML = `
            <div class="success-icon">✓</div>
            <div class="success-text">Sale Recorded!</div>
        `;
        return feedback;
    }
    
    /**
     * Animate price change
     */
    function animatePriceChange(priceElement, oldPrice, newPrice) {
        const isIncrease = newPrice > oldPrice;
        const animationClass = isIncrease ? 'price-increase' : 'price-decrease';
        
        priceElement.classList.add(animationClass);
        
        setTimeout(() => {
            priceElement.classList.remove(animationClass);
        }, 1000);
    }
    
    /**
     * Update button visual state
     */
    function updateButtonState(button, state) {
        const states = ['idle', 'loading', 'success', 'error'];
        
        states.forEach(s => {
            button.classList.remove(`state-${s}`);
        });
        
        button.classList.add(`state-${state}`);
    }
    
    /**
     * Handle button interaction feedback
     */
    function showInteractionFeedback(button, type = 'tap') {
        button.classList.add(`feedback-${type}`);
        
        setTimeout(() => {
            button.classList.remove(`feedback-${type}`);
        }, 200);
    }
    
    /**
     * Create button structure
     */
    function createButtonStructure(drink) {
        const button = document.createElement('button');
        const id = generateId();
        
        button.className = 'drink-button';
        button.id = id;
        button.setAttribute('data-drink-id', drink.drink_id || drink.id);
        button.setAttribute('data-component-id', id);
        button.setAttribute('type', 'button');
        button.setAttribute('aria-label', `Record sale for ${drink.name}`);
        
        // Create button content structure
        const content = document.createElement('div');
        content.className = 'button-content';
        
        const header = document.createElement('div');
        header.className = 'button-header';
        
        const name = document.createElement('div');
        name.className = 'drink-name';
        name.textContent = drink.name || 'Unknown Drink';
        
        const trendIndicator = createTrendIndicator(drink.trend || 'stable');
        
        header.appendChild(name);
        header.appendChild(trendIndicator);
        
        const priceContainer = document.createElement('div');
        priceContainer.className = 'price-container';
        
        const price = document.createElement('div');
        price.className = 'drink-price';
        price.textContent = window.AbbeyUtils.formatPrice(drink.current_price || 0);
        
        const priceLabel = document.createElement('div');
        priceLabel.className = 'price-label';
        priceLabel.textContent = 'Current Price';
        
        priceContainer.appendChild(price);
        priceContainer.appendChild(priceLabel);
        
        // Additional info section
        const info = document.createElement('div');
        info.className = 'drink-info';
        
        const position = document.createElement('div');
        position.className = 'drink-position';
        position.textContent = `#${drink.list_position || 1}`;
        
        const salesCount = document.createElement('div');
        salesCount.className = 'sales-count';
        salesCount.textContent = `${drink.sales_count || 0} sold today`;
        
        info.appendChild(position);
        info.appendChild(salesCount);
        
        // Assemble button
        content.appendChild(header);
        content.appendChild(priceContainer);
        content.appendChild(info);
        
        button.appendChild(content);
        
        // Create overlay elements (hidden by default)
        const loadingOverlay = createLoadingOverlay();
        const successFeedback = createSuccessFeedback();
        
        button.appendChild(loadingOverlay);
        button.appendChild(successFeedback);
        
        return button;
    }
    
    /**
     * Add touch enhancements
     */
    function addTouchEnhancements(button) {
        let touchStartTime = 0;
        
        // Touch start
        button.addEventListener('touchstart', function(e) {
            touchStartTime = Date.now();
            showInteractionFeedback(button, 'touch-start');
            
            // Prevent double-tap zoom
            e.preventDefault();
        }, { passive: false });
        
        // Touch end
        button.addEventListener('touchend', function(e) {
            const touchDuration = Date.now() - touchStartTime;
            
            if (touchDuration < 1000) { // Normal tap
                showInteractionFeedback(button, 'touch-end');
            }
            
            e.preventDefault();
        }, { passive: false });
        
        // Mouse events for desktop
        button.addEventListener('mousedown', function() {
            showInteractionFeedback(button, 'mouse-down');
        });
        
        button.addEventListener('mouseup', function() {
            showInteractionFeedback(button, 'mouse-up');
        });
    }
    
    /**
     * Add accessibility features
     */
    function addAccessibilityFeatures(button, drink) {
        // ARIA attributes
        button.setAttribute('role', 'button');
        button.setAttribute('aria-describedby', `${button.id}-description`);
        
        // Create description element
        const description = document.createElement('div');
        description.id = `${button.id}-description`;
        description.className = 'sr-only';
        description.textContent = `Record sale for ${drink.name} at ${window.AbbeyUtils.formatPrice(drink.current_price)}. Current trend: ${drink.trend || 'stable'}`;
        
        button.appendChild(description);
        
        // Keyboard support
        button.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                showInteractionFeedback(button, 'keyboard');
                button.click();
            }
        });
        
        // Focus management
        button.addEventListener('focus', function() {
            button.classList.add('keyboard-focus');
        });
        
        button.addEventListener('blur', function() {
            button.classList.remove('keyboard-focus');
        });
    }
    
    return {
        /**
         * Create drink button element
         * @param {Object} drink - Drink data
         * @param {Object} options - Configuration options
         * @returns {HTMLElement} Button element
         */
        create: function(drink, options = {}) {
            const defaultOptions = {
                enableTouch: true,
                enableAccessibility: true,
                enableAnimation: true,
                size: 'normal', // normal, large, small
                variant: 'default' // default, compact, detailed
            };
            
            const config = Object.assign({}, defaultOptions, options);
            
            // Create button structure
            const button = createButtonStructure(drink);
            
            // Apply size and variant classes
            button.classList.add(`size-${config.size}`);
            button.classList.add(`variant-${config.variant}`);
            
            if (config.enableAnimation) {
                button.classList.add('animated');
            }
            
            // Add touch enhancements
            if (config.enableTouch) {
                addTouchEnhancements(button);
            }
            
            // Add accessibility features
            if (config.enableAccessibility) {
                addAccessibilityFeatures(button, drink);
            }
            
            // Store button instance data
            const instanceData = {
                id: button.getAttribute('data-component-id'),
                drink: drink,
                options: config,
                element: button,
                state: 'idle'
            };
            
            buttonInstances.set(button.getAttribute('data-component-id'), instanceData);
            
            // Set initial state
            updateButtonState(button, 'idle');
            
            return button;
        },
        
        /**
         * Update button with new drink data
         * @param {HTMLElement} button - Button element
         * @param {Object} newDrink - Updated drink data
         * @param {Object} options - Update options
         */
        update: function(button, newDrink, options = {}) {
            const componentId = button.getAttribute('data-component-id');
            const instance = buttonInstances.get(componentId);
            
            if (!instance) {
                console.warn('DrinkButton: No instance found for button');
                return;
            }
            
            const oldDrink = instance.drink;
            const animated = options.animated !== false && instance.options.enableAnimation;
            
            // Update drink data
            instance.drink = newDrink;
            
            // Update name
            const nameElement = button.querySelector('.drink-name');
            if (nameElement && oldDrink.name !== newDrink.name) {
                nameElement.textContent = newDrink.name;
            }
            
            // Update price with animation
            const priceElement = button.querySelector('.drink-price');
            if (priceElement) {
                const oldPrice = oldDrink.current_price || 0;
                const newPrice = newDrink.current_price || 0;
                
                priceElement.textContent = window.AbbeyUtils.formatPrice(newPrice);
                
                if (animated && oldPrice !== newPrice) {
                    animatePriceChange(priceElement, oldPrice, newPrice);
                }
            }
            
            // Update trend indicator
            const trendElement = button.querySelector('.trend-indicator');
            if (trendElement && oldDrink.trend !== newDrink.trend) {
                const newTrendIndicator = createTrendIndicator(newDrink.trend);
                trendElement.replaceWith(newTrendIndicator);
            }
            
            // Update position
            const positionElement = button.querySelector('.drink-position');
            if (positionElement) {
                positionElement.textContent = `#${newDrink.list_position || 1}`;
            }
            
            // Update sales count
            const salesElement = button.querySelector('.sales-count');
            if (salesElement) {
                salesElement.textContent = `${newDrink.sales_count || 0} sold today`;
            }
            
            // Update accessibility description
            const descriptionElement = button.querySelector(`#${button.id}-description`);
            if (descriptionElement) {
                descriptionElement.textContent = `Record sale for ${newDrink.name} at ${window.AbbeyUtils.formatPrice(newDrink.current_price)}. Current trend: ${newDrink.trend || 'stable'}`;
            }
            
            // Update aria-label
            button.setAttribute('aria-label', `Record sale for ${newDrink.name}`);
        },
        
        /**
         * Attach click handler with built-in loading states
         * @param {HTMLElement} button - Button element
         * @param {Function} handler - Click handler (should return Promise)
         * @param {Object} options - Handler options
         */
        attachHandler: function(button, handler, options = {}) {
            const componentId = button.getAttribute('data-component-id');
            const instance = buttonInstances.get(componentId);
            
            if (!instance) {
                console.warn('DrinkButton: No instance found for button');
                return;
            }
            
            const defaultOptions = {
                showLoading: true,
                showSuccess: true,
                successDuration: 1500,
                preventDoubleClick: true
            };
            
            const config = Object.assign({}, defaultOptions, options);
            
            button.addEventListener('click', async function(e) {
                e.preventDefault();
                
                // Prevent double clicks
                if (config.preventDoubleClick && instance.state !== 'idle') {
                    return;
                }
                
                try {
                    // Show loading state
                    if (config.showLoading) {
                        instance.state = 'loading';
                        updateButtonState(button, 'loading');
                        button.disabled = true;
                    }
                    
                    // Call handler
                    const result = await handler.call(this, e, instance.drink);
                    
                    // Show success state
                    if (config.showSuccess) {
                        instance.state = 'success';
                        updateButtonState(button, 'success');
                        
                        setTimeout(() => {
                            instance.state = 'idle';
                            updateButtonState(button, 'idle');
                            button.disabled = false;
                        }, config.successDuration);
                    } else {
                        instance.state = 'idle';
                        updateButtonState(button, 'idle');
                        button.disabled = false;
                    }
                    
                    return result;
                    
                } catch (error) {
                    console.error('DrinkButton: Handler error:', error);
                    
                    // Show error state
                    instance.state = 'error';
                    updateButtonState(button, 'error');
                    
                    // Auto-recover from error
                    setTimeout(() => {
                        instance.state = 'idle';
                        updateButtonState(button, 'idle');
                        button.disabled = false;
                    }, 2000);
                    
                    throw error;
                }
            });
        },
        
        /**
         * Set button loading state manually
         * @param {HTMLElement} button - Button element
         * @param {boolean} loading - Loading state
         */
        setLoading: function(button, loading) {
            const componentId = button.getAttribute('data-component-id');
            const instance = buttonInstances.get(componentId);
            
            if (instance) {
                instance.state = loading ? 'loading' : 'idle';
                updateButtonState(button, instance.state);
                button.disabled = loading;
            }
        },
        
        /**
         * Get button instance data
         * @param {HTMLElement} button - Button element
         * @returns {Object} Instance data
         */
        getInstance: function(button) {
            const componentId = button.getAttribute('data-component-id');
            return buttonInstances.get(componentId);
        },
        
        /**
         * Destroy button instance
         * @param {HTMLElement} button - Button element
         */
        destroy: function(button) {
            const componentId = button.getAttribute('data-component-id');
            
            if (componentId) {
                buttonInstances.delete(componentId);
            }
            
            // Remove all event listeners by cloning the element
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        },
        
        /**
         * Create multiple buttons from drinks array
         * @param {Array} drinks - Array of drink objects
         * @param {Object} options - Creation options
         * @returns {Array} Array of button elements
         */
        createMultiple: function(drinks, options = {}) {
            return drinks.map(drink => this.create(drink, options));
        },
        
        /**
         * Update multiple buttons
         * @param {Array} buttons - Array of button elements
         * @param {Array} drinks - Array of updated drink data
         * @param {Object} options - Update options
         */
        updateMultiple: function(buttons, drinks, options = {}) {
            buttons.forEach((button, index) => {
                if (drinks[index]) {
                    this.update(button, drinks[index], options);
                }
            });
        },
        
        /**
         * Get all button instances
         * @returns {Map} All button instances
         */
        getAllInstances: function() {
            return new Map(buttonInstances);
        },
        
        /**
         * Clear all instances (cleanup)
         */
        clearAllInstances: function() {
            buttonInstances.clear();
        }
    };
})();