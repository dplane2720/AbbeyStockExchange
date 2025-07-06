/**
 * Abbey Stock Exchange v5 - Modal Manager
 * 
 * Comprehensive modal management system for settings interfaces,
 * confirmation dialogs, and complex modal workflows with touch optimization,
 * keyboard navigation, and accessibility features.
 */

window.ModalManager = (function() {
    'use strict';
    
    // Modal instance tracking
    const modalInstances = new Map();
    const modalStack = [];
    let backdropElement = null;
    let isInitialized = false;
    
    // Configuration
    const config = {
        backdropDismiss: true,
        escapeClose: true,
        focusTrap: true,
        restoreFocus: true,
        animation: true,
        animationDuration: 300
    };
    
    /**
     * Create backdrop element
     */
    function createBackdrop() {
        if (backdropElement) return backdropElement;
        
        backdropElement = document.createElement('div');
        backdropElement.className = 'modal-backdrop';
        backdropElement.setAttribute('aria-hidden', 'true');
        
        // Backdrop click handler
        backdropElement.addEventListener('click', function(e) {
            if (e.target === backdropElement && config.backdropDismiss) {
                const topModal = getTopModal();
                if (topModal) {
                    hide(topModal.id);
                }
            }
        });
        
        document.body.appendChild(backdropElement);
        return backdropElement;
    }
    
    /**
     * Get top modal from stack
     */
    function getTopModal() {
        return modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
    }
    
    /**
     * Update backdrop visibility
     */
    function updateBackdrop() {
        const backdrop = createBackdrop();
        
        if (modalStack.length > 0) {
            backdrop.classList.add('show');
            backdrop.style.zIndex = getBaseZIndex() + (modalStack.length * 2) - 1;
        } else {
            backdrop.classList.remove('show');
            setTimeout(() => {
                if (modalStack.length === 0) {
                    backdrop.style.zIndex = '';
                }
            }, config.animationDuration);
        }
    }
    
    /**
     * Get base z-index for modals
     */
    function getBaseZIndex() {
        return 1050; // Bootstrap-like z-index
    }
    
    /**
     * Create modal structure if it doesn't exist
     */
    function ensureModalStructure(modalId) {
        let modal = document.getElementById(modalId);
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = modalId;
            modal.className = 'modal';
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-hidden', 'true');
            
            const dialog = document.createElement('div');
            dialog.className = 'modal-dialog';
            dialog.setAttribute('role', 'document');
            
            const content = document.createElement('div');
            content.className = 'modal-content';
            
            dialog.appendChild(content);
            modal.appendChild(dialog);
            document.body.appendChild(modal);
        }
        
        return modal;
    }
    
    /**
     * Setup focus trap for modal
     */
    function setupFocusTrap(modal) {
        if (!config.focusTrap) return;
        
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        
        if (focusableElements.length === 0) return;
        
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        
        function trapFocus(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        }
        
        modal.addEventListener('keydown', trapFocus);
        
        // Store for cleanup
        modal._focusTrapHandler = trapFocus;
        
        // Focus first element
        setTimeout(() => {
            firstElement.focus();
        }, config.animationDuration);
    }
    
    /**
     * Remove focus trap
     */
    function removeFocusTrap(modal) {
        if (modal._focusTrapHandler) {
            modal.removeEventListener('keydown', modal._focusTrapHandler);
            delete modal._focusTrapHandler;
        }
    }
    
    /**
     * Setup keyboard navigation
     */
    function setupKeyboardNav(modal) {
        function handleKeydown(e) {
            switch (e.key) {
                case 'Escape':
                    if (config.escapeClose) {
                        e.preventDefault();
                        hide(modal.id);
                    }
                    break;
                    
                case 'ArrowUp':
                case 'ArrowDown':
                    // Handle vertical navigation in forms
                    handleArrowNavigation(e);
                    break;
            }
        }
        
        modal.addEventListener('keydown', handleKeydown);
        modal._keydownHandler = handleKeydown;
    }
    
    /**
     * Handle arrow key navigation
     */
    function handleArrowNavigation(e) {
        const focusableElements = Array.from(e.currentTarget.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ));
        
        const currentIndex = focusableElements.indexOf(document.activeElement);
        if (currentIndex === -1) return;
        
        let nextIndex;
        if (e.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % focusableElements.length;
        } else if (e.key === 'ArrowUp') {
            nextIndex = currentIndex === 0 ? focusableElements.length - 1 : currentIndex - 1;
        }
        
        if (nextIndex !== undefined) {
            e.preventDefault();
            focusableElements[nextIndex].focus();
        }
    }
    
    /**
     * Remove keyboard navigation
     */
    function removeKeyboardNav(modal) {
        if (modal._keydownHandler) {
            modal.removeEventListener('keydown', modal._keydownHandler);
            delete modal._keydownHandler;
        }
    }
    
    /**
     * Setup touch enhancements
     */
    function setupTouchEnhancements(modal) {
        // Prevent body scroll when modal is open
        modal.addEventListener('touchmove', function(e) {
            const dialog = modal.querySelector('.modal-dialog');
            if (dialog && !dialog.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Enhanced touch targets for buttons
        const buttons = modal.querySelectorAll('button');
        buttons.forEach(button => {
            button.style.minHeight = '44px'; // iOS recommendation
            button.style.minWidth = '44px';
        });
    }
    
    /**
     * Animate modal in
     */
    function animateIn(modal) {
        if (!config.animation) {
            modal.classList.add('show');
            return Promise.resolve();
        }
        
        return new Promise(resolve => {
            modal.classList.add('showing');
            
            setTimeout(() => {
                modal.classList.remove('showing');
                modal.classList.add('show');
                resolve();
            }, config.animationDuration);
        });
    }
    
    /**
     * Animate modal out
     */
    function animateOut(modal) {
        if (!config.animation) {
            modal.classList.remove('show');
            return Promise.resolve();
        }
        
        return new Promise(resolve => {
            modal.classList.add('hiding');
            modal.classList.remove('show');
            
            setTimeout(() => {
                modal.classList.remove('hiding');
                resolve();
            }, config.animationDuration);
        });
    }
    
    /**
     * Initialize global modal system
     */
    function initialize() {
        if (isInitialized) return;
        
        // Create backdrop
        createBackdrop();
        
        // Global event handlers
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && config.escapeClose) {
                const topModal = getTopModal();
                if (topModal) {
                    hide(topModal.id);
                }
            }
        });
        
        // Prevent body scroll when modals are open
        document.addEventListener('touchmove', function(e) {
            if (modalStack.length > 0) {
                const topModal = getTopModal();
                if (topModal && !topModal.element.contains(e.target)) {
                    e.preventDefault();
                }
            }
        }, { passive: false });
        
        isInitialized = true;
    }
    
    /**
     * Show modal
     */
    function show(modalId, options = {}) {
        initialize();
        
        const modal = ensureModalStructure(modalId);
        const instance = modalInstances.get(modalId) || {};
        
        // Check if already shown
        if (modal.classList.contains('show')) {
            return Promise.resolve(modal);
        }
        
        // Store current focus for restoration
        const previousActiveElement = document.activeElement;
        
        // Configure modal
        const modalConfig = Object.assign({}, config, options);
        
        // Setup modal instance
        const modalInstance = {
            id: modalId,
            element: modal,
            config: modalConfig,
            previousActiveElement,
            showTime: Date.now()
        };
        
        modalInstances.set(modalId, modalInstance);
        modalStack.push(modalInstance);
        
        // Set z-index
        modal.style.zIndex = getBaseZIndex() + (modalStack.length * 2);
        
        // Setup modal features
        setupKeyboardNav(modal);
        setupTouchEnhancements(modal);
        
        // Show modal
        modal.style.display = 'block';
        modal.setAttribute('aria-hidden', 'false');
        
        // Update backdrop
        updateBackdrop();
        
        // Animate in and setup focus
        return animateIn(modal).then(() => {
            setupFocusTrap(modal);
            
            // Dispatch show event
            const showEvent = new CustomEvent('modal:show', {
                detail: { modal, modalId, instance: modalInstance }
            });
            document.dispatchEvent(showEvent);
            
            // Update state manager
            if (window.StateManager) {
                window.StateManager.openModal(modalId, options);
            }
            
            return modal;
        });
    }
    
    /**
     * Hide modal
     */
    function hide(modalId) {
        const modal = document.getElementById(modalId);
        const instance = modalInstances.get(modalId);
        
        if (!modal || !instance || !modal.classList.contains('show')) {
            return Promise.resolve();
        }
        
        // Remove from stack
        const stackIndex = modalStack.findIndex(m => m.id === modalId);
        if (stackIndex !== -1) {
            modalStack.splice(stackIndex, 1);
        }
        
        // Clean up modal features
        removeFocusTrap(modal);
        removeKeyboardNav(modal);
        
        // Animate out
        return animateOut(modal).then(() => {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            modal.style.zIndex = '';
            
            // Update backdrop
            updateBackdrop();
            
            // Restore focus
            if (config.restoreFocus && instance.previousActiveElement) {
                instance.previousActiveElement.focus();
            }
            
            // Clean up instance
            modalInstances.delete(modalId);
            
            // Dispatch hide event
            const hideEvent = new CustomEvent('modal:hide', {
                detail: { modal, modalId, instance }
            });
            document.dispatchEvent(hideEvent);
            
            // Update state manager
            if (window.StateManager) {
                window.StateManager.closeModal(modalId);
            }
        });
    }
    
    /**
     * Toggle modal visibility
     */
    function toggle(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        
        if (modal && modal.classList.contains('show')) {
            return hide(modalId);
        } else {
            return show(modalId, options);
        }
    }
    
    /**
     * Create modal content dynamically
     */
    function createModal(modalId, content, options = {}) {
        const modal = ensureModalStructure(modalId);
        const modalContent = modal.querySelector('.modal-content');
        
        if (typeof content === 'string') {
            modalContent.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            modalContent.innerHTML = '';
            modalContent.appendChild(content);
        }
        
        // Add default close button if requested
        if (options.showCloseButton !== false) {
            addCloseButton(modal);
        }
        
        return modal;
    }
    
    /**
     * Add close button to modal
     */
    function addCloseButton(modal) {
        const header = modal.querySelector('.modal-header');
        if (header && !header.querySelector('.modal-close')) {
            const closeButton = document.createElement('button');
            closeButton.className = 'modal-close';
            closeButton.setAttribute('type', 'button');
            closeButton.setAttribute('aria-label', 'Close modal');
            closeButton.innerHTML = '×';
            
            closeButton.addEventListener('click', function() {
                hide(modal.id);
            });
            
            header.appendChild(closeButton);
        }
    }
    
    /**
     * Create confirmation dialog
     */
    function confirm(message, options = {}) {
        const defaultOptions = {
            title: 'Confirm',
            confirmText: 'OK',
            cancelText: 'Cancel',
            confirmClass: 'btn-primary',
            cancelClass: 'btn-secondary'
        };
        
        const config = Object.assign({}, defaultOptions, options);
        const modalId = 'confirmation-modal';
        
        const content = `
            <div class="modal-header">
                <h4 class="modal-title">${config.title}</h4>
                <button type="button" class="modal-close" aria-label="Close modal">×</button>
            </div>
            <div class="modal-body">
                <p>${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn ${config.cancelClass}" data-action="cancel">
                    ${config.cancelText}
                </button>
                <button type="button" class="btn ${config.confirmClass}" data-action="confirm">
                    ${config.confirmText}
                </button>
            </div>
        `;
        
        createModal(modalId, content, { showCloseButton: false });
        
        return new Promise((resolve) => {
            const modal = document.getElementById(modalId);
            
            function handleAction(action) {
                hide(modalId).then(() => {
                    resolve(action === 'confirm');
                });
            }
            
            // Add event listeners
            modal.querySelector('[data-action="confirm"]').addEventListener('click', () => handleAction('confirm'));
            modal.querySelector('[data-action="cancel"]').addEventListener('click', () => handleAction('cancel'));
            modal.querySelector('.modal-close').addEventListener('click', () => handleAction('cancel'));
            
            show(modalId);
        });
    }
    
    /**
     * Create alert dialog
     */
    function alert(message, options = {}) {
        const defaultOptions = {
            title: 'Alert',
            buttonText: 'OK',
            buttonClass: 'btn-primary'
        };
        
        const config = Object.assign({}, defaultOptions, options);
        const modalId = 'alert-modal';
        
        const content = `
            <div class="modal-header">
                <h4 class="modal-title">${config.title}</h4>
                <button type="button" class="modal-close" aria-label="Close modal">×</button>
            </div>
            <div class="modal-body">
                <p>${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn ${config.buttonClass}" data-action="ok">
                    ${config.buttonText}
                </button>
            </div>
        `;
        
        createModal(modalId, content, { showCloseButton: false });
        
        return new Promise((resolve) => {
            const modal = document.getElementById(modalId);
            
            function handleClose() {
                hide(modalId).then(() => {
                    resolve();
                });
            }
            
            // Add event listeners
            modal.querySelector('[data-action="ok"]').addEventListener('click', handleClose);
            modal.querySelector('.modal-close').addEventListener('click', handleClose);
            
            show(modalId);
        });
    }
    
    /**
     * Generate content for specific modal types
     */
    function generateModalContent(modalType, data = {}) {
        switch (modalType) {
            case 'drink-list':
                return generateDrinkListModal(data);
            case 'app-settings':
                return generateAppSettingsModal(data);
            case 'backups':
                return generateBackupsModal(data);
            case 'add-drink':
                return generateAddDrinkModal(data);
            case 'edit-drink':
                return generateEditDrinkModal(data);
            default:
                return `<div class="modal-content">
                    <div class="modal-header">
                        <h4 class="modal-title">Unknown Modal</h4>
                        <button type="button" class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <p>Modal type "${modalType}" not found.</p>
                    </div>
                </div>`;
        }
    }
    
    /**
     * Apply dynamic scaling to drink list modal based on drink count
     */
    function applyDrinkListModalScaling(modal, drinkCount) {
        const modalBody = modal.querySelector('.drink-list-modal');
        if (!modalBody) return;
        
        // Remove existing scaling classes
        modalBody.classList.remove('few-drinks', 'normal-drinks', 'many-drinks', 'lots-of-drinks', 'scrollable');
        
        // Apply appropriate scaling class based on drink count
        if (drinkCount <= 5) {
            modalBody.classList.add('few-drinks');
        } else if (drinkCount <= 10) {
            modalBody.classList.add('normal-drinks');
        } else if (drinkCount <= 15) {
            modalBody.classList.add('many-drinks');
        } else if (drinkCount <= 20) {
            modalBody.classList.add('lots-of-drinks');
        } else {
            // Too many drinks, enable scrolling
            modalBody.classList.add('scrollable');
        }
        
        // Also set CSS custom property for more precise control
        modalBody.style.setProperty('--drink-count', drinkCount);
        
        console.log(`[ModalManager] Applied scaling for ${drinkCount} drinks in modal`);
    }
    function generateDrinkListModal(data) {
        const drinks = data.drinks || [];
        
        let drinksRows = '';
        drinks.forEach((drink, index) => {
            drinksRows += `
                <tr data-drink-id="${drink.id || index}">
                    <td class="drink-name">${drink.name}</td>
                    <td class="reorder-controls">
                        <button class="reorder-btn up" data-action="move-up" data-drink-id="${drink.id || index}">↑</button>
                        <button class="reorder-btn down" data-action="move-down" data-drink-id="${drink.id || index}">↓</button>
                    </td>
                    <td class="current-price">${parseFloat(drink.current_price || 0).toFixed(2)}</td>
                    <td class="min-price">${parseFloat(drink.minimum_price || 0).toFixed(2)}</td>
                    <td class="actions">
                        <button class="action-btn edit" data-action="edit" data-drink-id="${drink.id || index}"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" data-action="delete" data-drink-id="${drink.id || index}"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
        
        return `
            <div class="modal-header">
                <h4 class="modal-title">Drink List Management</h4>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body drink-list-modal">
                <div class="drinks-table-container">
                    <table class="drinks-table">
                        <thead>
                            <tr>
                                <th>Drink Name</th>
                                <th>Reorder</th>
                                <th>Current</th>
                                <th>Min</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${drinksRows}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary add-drink-modal-btn" data-action="add-drink">
                    + Add Drink
                </button>
                <button type="button" class="btn btn-primary" data-action="save">Save Changes</button>
            </div>
        `;
    }
    
    /**
     * Generate app settings modal content
     */
    function generateAppSettingsModal(data) {
        const settings = data.settings || {};
        
        return `
            <div class="modal-header">
                <h4 class="modal-title">App Settings</h4>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body app-settings-modal">
                <form class="settings-form">
                    <div class="form-group">
                        <label for="display-title">Display Title:</label>
                        <input type="text" id="display-title" name="display_title" 
                               value="${settings.display_title || 'Abbey Stock Exchange'}" maxlength="100" required>
                    </div>
                    
                    <div class="form-group checkbox-inline">
                        <label for="sound-enabled">Sound Enabled:</label>
                        <input type="checkbox" id="sound-enabled" name="sound_enabled" 
                               ${settings.sound_enabled !== false ? 'checked' : ''}>
                    </div>
                    
                    <div class="form-group checkbox-inline">
                        <label for="auto-backup-enabled">Auto-backup Enabled:</label>
                        <input type="checkbox" id="auto-backup-enabled" name="auto_backup_enabled" 
                               ${settings.auto_backup_enabled !== false ? 'checked' : ''}>
                    </div>
                    
                    <div class="form-group">
                        <label for="refresh-cycle">Price Refresh Cycle (30 - 3600 seconds):</label>
                        <input type="number" id="refresh-cycle" name="refresh_cycle" 
                               value="${settings.refresh_cycle || 30}" min="30" max="3600" step="30" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="backup-retention-days">Daily Backup Retention (1 - 365 days):</label>
                        <input type="number" id="backup-retention-days" name="backup_retention_days" 
                               value="${settings.backup_retention_days || 30}" min="1" max="365" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="display-layout">Display Layout:</label>
                        <select id="display-layout" name="display_layout" required>
                            <option value="single-column" ${(settings.display_layout || 'single-column') === 'single-column' ? 'selected' : ''}>Single Column</option>
                            <option value="two-column" ${settings.display_layout === 'two-column' ? 'selected' : ''}>Two Columns</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="font-scale">Font Size Scale (50% - 200%):</label>
                        <div class="font-scale-container">
                            <input type="range" id="font-scale" name="font_scale" 
                                   value="${settings.font_scale || 100}" min="50" max="200" step="10" 
                                   oninput="document.getElementById('font-scale-value').textContent = this.value + '%'">
                            <span id="font-scale-value">${settings.font_scale || 100}%</span>
                        </div>
                        <input type="hidden" id="font-scale-hidden" name="font_scale" value="${settings.font_scale || 100}">
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" data-action="save">Save Settings</button>
            </div>
        `;
    }
    
    /**
     * Generate backups modal content
     */
    function generateBackupsModal(data) {
        const backups = data.backups || [];
        const lastBackup = data.lastBackup || 'Never';
        
        let backupRows = '';
        backups.forEach(backup => {
            backupRows += `
                <tr data-backup-name="${backup.name}">
                    <td class="backup-date">${backup.date || backup.name}</td>
                    <td class="backup-actions">
                        <button class="btn btn-sm btn-success" data-action="restore" data-backup="${backup.name}">
                            ↻ Restore
                        </button>
                        <button class="btn btn-sm btn-danger" data-action="delete" data-backup="${backup.name}">
                            🗑️
                        </button>
                    </td>
                </tr>
            `;
        });
        
        return `
            <div class="modal-header">
                <h4 class="modal-title">Backup Management</h4>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body backups-modal">
                <div class="backup-status">
                    <p><strong>Last backup:</strong> ${lastBackup}</p>
                </div>
                
                <button class="btn btn-success create-backup-btn" data-action="create-backup">
                    💾 Create Manual Backup
                </button>
                
                <h5>Available Backups</h5>
                <div class="backups-table-container">
                    <table class="backups-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${backupRows}
                        </tbody>
                    </table>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-action="close">Close</button>
            </div>
        `;
    }
    
    /**
     * Generate add drink modal content
     */
    function generateAddDrinkModal(data) {
        return `
            <div class="modal-header">
                <h4 class="modal-title">New Drink Details</h4>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body add-drink-modal">
                <form class="drink-form">
                    <div class="form-group">
                        <label for="drink-name">Drink Name:</label>
                        <input type="text" id="drink-name" name="name" required 
                               placeholder="Enter drink name" maxlength="50">
                    </div>
                    
                    <div class="form-group">
                        <label for="minimum-price">Minimum (Starting) Price $:</label>
                        <input type="number" id="minimum-price" name="minimum_price" 
                               value="0.00" min="0" max="100" step="0.25" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="price-step">Price Step Size:</label>
                        <input type="number" id="price-step" name="price_step_size" 
                               value="0.50" min="0.25" max="5.00" step="0.25" required>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" data-action="add">
                    + Add Drink
                </button>
            </div>
        `;
    }
    
    /**
     * Generate edit drink modal content
     */
    function generateEditDrinkModal(data) {
        const drink = data.drink || {};
        
        return `
            <div class="modal-header">
                <h4 class="modal-title">Edit Drink Details</h4>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body edit-drink-modal">
                <form class="drink-form">
                    <input type="hidden" name="id" value="${drink.id || ''}">
                    
                    <div class="form-group">
                        <label for="edit-drink-name">Drink Name:</label>
                        <input type="text" id="edit-drink-name" name="name" required 
                               value="${drink.name || ''}" placeholder="Enter drink name" maxlength="50">
                    </div>
                    
                    <div class="form-group">
                        <label for="edit-minimum-price">Minimum Price $:</label>
                        <input type="number" id="edit-minimum-price" name="minimum_price" 
                               value="${drink.minimum_price || 0}" min="0" max="100" step="0.25" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="edit-current-price">Current Price $:</label>
                        <input type="number" id="edit-current-price" name="current_price" 
                               value="${drink.current_price || drink.minimum_price || 0}" min="0" max="100" step="0.25" required>
                    </div>
                    
                    <div class="form-group">
                        <label for="edit-price-step">Price Step Size:</label>
                        <input type="number" id="edit-price-step" name="price_step_size" 
                               value="${drink.price_step_size || 0.50}" min="0.25" max="5.00" step="0.25" required>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-danger" data-action="delete">
                    🗑️ Delete Drink
                </button>
                <button type="button" class="btn btn-primary" data-action="save">Save Changes</button>
            </div>
        `;
    }
    
    /**
     * Open specialized modal
     */
    function openSpecializedModal(modalType, data = {}) {
        const modalId = `${modalType}-modal`;
        const content = generateModalContent(modalType, data);
        
        createModal(modalId, content, { showCloseButton: false });
        
        // Attach specialized event handlers
        const modal = document.getElementById(modalId);
        attachModalEventHandlers(modal, modalType, data);
        
        return show(modalId);
    }
    
    /**
     * Attach event handlers to modal based on type
     */
    function attachModalEventHandlers(modal, modalType, data) {
        // Common close handlers
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => hide(modal.id));
        }
        
        // Type-specific handlers
        switch (modalType) {
            case 'drink-list':
                attachDrinkListHandlers(modal);
                break;
            case 'app-settings':
                attachAppSettingsHandlers(modal);
                break;
            case 'backups':
                attachBackupsHandlers(modal);
                break;
            case 'add-drink':
                attachAddDrinkHandlers(modal);
                break;
            case 'edit-drink':
                attachEditDrinkHandlers(modal, data);
                break;
        }
    }
    
    /**
     * Attach drink list modal handlers
     */
    function attachDrinkListHandlers(modal) {
        // Apply dynamic scaling based on drink count
        const drinkRows = modal.querySelectorAll('.drinks-table tbody tr');
        applyDrinkListModalScaling(modal, drinkRows.length);
        
        // Main event handler for all clicks
        modal.addEventListener('click', async function(e) {
            const action = e.target.getAttribute('data-action');
            
            // Handle close button
            if (action === 'cancel') {
                hide(modal.id);
                return;
            }
            
            // Handle save changes button
            if (action === 'save') {
                // For now, just close the modal since the individual operations already save
                hide(modal.id);
                
                // Refresh drinks data
                if (window.AdminPage) {
                    await window.AdminPage.refresh();
                }
                return;
            }
            
            // Handle reorder buttons
            if (e.target.classList.contains('reorder-btn')) {
                const action = e.target.getAttribute('data-action');
                const drinkId = parseInt(e.target.getAttribute('data-drink-id'));
                
                try {
                    await reorderDrink(drinkId, action);
                    
                    // Refresh the modal content
                    const drinksResponse = await window.APIClient.get('/api/drinks');
                    if (drinksResponse.success) {
                        updateDrinkListModal(modal, drinksResponse.data);
                        // Reapply scaling after update
                        applyDrinkListModalScaling(modal, drinksResponse.data.length);
                    }
                } catch (error) {
                    console.error(`Failed to reorder drink:`, error);
                }
            }
            
            // Handle action buttons (edit/delete)
            if (e.target.classList.contains('action-btn')) {
                const action = e.target.getAttribute('data-action');
                const drinkId = e.target.getAttribute('data-drink-id');
                
                if (action === 'edit') {
                    console.log(`Edit drink ${drinkId}`);
                    // Open edit modal
                    if (window.AdminPage) {
                        window.AdminPage.openModal('edit-drink', { drinkId });
                    }
                } else if (action === 'delete') {
                    const confirmed = await confirm('Are you sure you want to delete this drink?');
                    if (confirmed) {
                        try {
                            if (window.APIClient) {
                                const response = await window.APIClient.delete(`/api/drinks/${drinkId}`);
                                if (response.success) {
                                    // Show success notification
                                    if (window.StateManager) {
                                        window.StateManager.addNotification('success', 'Drink deleted successfully');
                                    }
                                    
                                    // Refresh the modal with updated drink list
                                    hide(modal.id);
                                    if (window.AdminPage) {
                                        setTimeout(() => {
                                            window.AdminPage.openModal('drink-list');
                                        }, 300);
                                    }
                                } else {
                                    throw new Error(response.error || 'Failed to delete drink');
                                }
                            }
                        } catch (error) {
                            console.error('Failed to delete drink:', error);
                            if (window.StateManager) {
                                window.StateManager.addNotification('error', `Failed to delete drink: ${error.message}`);
                            }
                        }
                    }
                }
            }
            
            // Handle add drink button
            if (e.target.classList.contains('add-drink-modal-btn')) {
                openSpecializedModal('add-drink');
            }
        });
    }
    
    /**
     * Attach app settings modal handlers
     */
    function attachAppSettingsHandlers(modal) {
        const saveBtn = modal.querySelector('[data-action="save"]');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const form = modal.querySelector('.settings-form');
        
        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                // Validate form
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }
                
                const formData = new FormData(form);
                
                // Get font scale from range input
                const fontScaleRange = form.querySelector('#font-scale');
                const fontScaleValue = fontScaleRange ? parseInt(fontScaleRange.value) : 100;
                
                const settings = {
                    refresh_cycle: parseInt(formData.get('refresh_cycle')),
                    display_title: formData.get('display_title'),
                    sound_enabled: formData.get('sound_enabled') === 'on',
                    auto_backup_enabled: formData.get('auto_backup_enabled') === 'on',
                    backup_retention_days: parseInt(formData.get('backup_retention_days')),
                    display_layout: formData.get('display_layout'),
                    font_scale: fontScaleValue
                };
                
                // Debug logging
                console.log('[AppSettings] Form data collected:', settings);
                
                try {
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving...';
                    
                    if (window.APIClient) {
                        const response = await window.APIClient.put('/api/settings', settings);
                        if (response.success) {
                            console.log('Settings saved successfully:', response.data);
                            
                            // Update state manager with new settings
                            if (window.StateManager) {
                                window.StateManager.setState('settings', response.data || settings);
                                window.StateManager.addNotification('success', 'Settings saved successfully');
                            }
                            
                            // Visual feedback on save button
                            saveBtn.textContent = '✅ Saved!';
                            saveBtn.style.backgroundColor = '#4caf50';
                            
                            setTimeout(() => {
                                hide(modal.id);
                            }, 1500);
                        } else {
                            throw new Error(response.error || response.message || 'Failed to save settings');
                        }
                    } else {
                        throw new Error('API client not available');
                    }
                } catch (error) {
                    console.error('Failed to save settings:', error);
                    
                    // Enhanced error handling for debugging
                    let errorMessage = 'Failed to save settings';
                    if (error.data && error.data.details) {
                        // Validation errors from API
                        console.error('Validation details:', error.data.details);
                        errorMessage = `Validation failed: ${JSON.stringify(error.data.details)}`;
                    } else if (error.message) {
                        errorMessage = error.message;
                    }
                    
                    // Show error notification
                    if (window.StateManager) {
                        window.StateManager.addNotification('error', errorMessage);
                    } else {
                        alert(errorMessage);
                    }
                    
                    // Reset button state on error
                    saveBtn.style.backgroundColor = '';
                    saveBtn.textContent = 'Save Settings';
                } finally {
                    saveBtn.disabled = false;
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => hide(modal.id));
        }
    }
    
    /**
     * Attach backups modal handlers
     */
    function attachBackupsHandlers(modal) {
        modal.addEventListener('click', async function(e) {
            const action = e.target.getAttribute('data-action');
            
            if (action === 'create-backup') {
                const button = e.target;
                try {
                    button.disabled = true;
                    button.textContent = 'Creating...';
                    
                    if (window.APIClient) {
                        const response = await window.APIClient.post('/api/backups', {});
                        if (response.success) {
                            console.log('Backup created successfully:', response.data);
                            
                            // Show success notification
                            if (window.StateManager) {
                                window.StateManager.addNotification('success', 'Backup created successfully');
                            }
                            
                            // Refresh the modal with updated backup list - reload in place instead of closing/reopening
                            if (window.AdminPage) {
                                // Reload backup data and update modal content
                                const backupsData = await window.AdminPage.loadBackupsData();
                                if (backupsData) {
                                    const newContent = generateBackupsModal({ 
                                        backups: backupsData.backups, 
                                        lastBackup: backupsData.lastBackup 
                                    });
                                    const modalContent = modal.querySelector('.modal-content');
                                    if (modalContent) {
                                        modalContent.innerHTML = newContent;
                                        // Re-attach handlers for the refreshed content
                                        attachBackupsHandlers(modal);
                                    }
                                }
                            }
                        } else {
                            throw new Error(response.error || response.message || 'Failed to create backup');
                        }
                    } else {
                        throw new Error('API client not available');
                    }
                } catch (error) {
                    console.error('Failed to create backup:', error);
                    
                    // Show error notification
                    if (window.StateManager) {
                        window.StateManager.addNotification('error', `Failed to create backup: ${error.message}`);
                    } else {
                        alert(`Failed to create backup: ${error.message}`);
                    }
                } finally {
                    button.disabled = false;
                    button.textContent = '💾 Create Manual Backup';
                }
            } else if (action === 'restore') {
                const backupName = e.target.getAttribute('data-backup');
                const confirmed = await confirm(`Are you sure you want to restore from "${backupName}"? This will overwrite current data.`);
                
                if (confirmed) {
                    const button = e.target;
                    try {
                        button.disabled = true;
                        button.textContent = 'Restoring...';
                        
                        if (window.APIClient) {
                            const response = await window.APIClient.post(`/api/backups/${backupName}/restore`, {});
                            if (response.success) {
                                console.log('Backup restored successfully');
                                
                                // Show success notification
                                if (window.StateManager) {
                                    window.StateManager.addNotification('success', 'Backup restored successfully');
                                }
                                
                                // Refresh page data
                                if (window.AdminPage) {
                                    await window.AdminPage.refresh();
                                }
                                
                                hide(modal.id);
                            } else {
                                throw new Error(response.error || response.message || 'Failed to restore backup');
                            }
                        } else {
                            throw new Error('API client not available');
                        }
                    } catch (error) {
                        console.error('Failed to restore backup:', error);
                        
                        // Show error notification
                        if (window.StateManager) {
                            window.StateManager.addNotification('error', `Failed to restore backup: ${error.message}`);
                        } else {
                            alert(`Failed to restore backup: ${error.message}`);
                        }
                        
                        button.disabled = false;
                        button.textContent = '↻ Restore';
                    }
                }
            } else if (action === 'delete') {
                const backupName = e.target.getAttribute('data-backup');
                const confirmed = await confirm(`Are you sure you want to delete backup "${backupName}"? This action cannot be undone.`);
                
                if (confirmed) {
                    const button = e.target;
                    try {
                        button.disabled = true;
                        button.textContent = 'Deleting...';
                        
                        if (window.APIClient) {
                            const response = await window.APIClient.delete(`/api/backups/${backupName}`);
                            if (response.success) {
                                console.log('Backup deleted successfully');
                                
                                // Show success notification
                                if (window.StateManager) {
                                    window.StateManager.addNotification('success', 'Backup deleted successfully');
                                }
                                
                                // Refresh the modal with updated backup list - reload in place
                                if (window.AdminPage) {
                                    const backupsData = await window.AdminPage.loadBackupsData();
                                    if (backupsData) {
                                        const newContent = generateBackupsModal({ 
                                            backups: backupsData.backups, 
                                            lastBackup: backupsData.lastBackup 
                                        });
                                        const modalContent = modal.querySelector('.modal-content');
                                        if (modalContent) {
                                            modalContent.innerHTML = newContent;
                                            attachBackupsHandlers(modal);
                                        }
                                    }
                                }
                            } else {
                                throw new Error(response.error || response.message || 'Failed to delete backup');
                            }
                        } else {
                            throw new Error('API client not available');
                        }
                    } catch (error) {
                        console.error('Failed to delete backup:', error);
                        
                        // Show error notification
                        if (window.StateManager) {
                            window.StateManager.addNotification('error', `Failed to delete backup: ${error.message}`);
                        } else {
                            alert(`Failed to delete backup: ${error.message}`);
                        }
                        
                        button.disabled = false;
                        button.textContent = '🗑️';
                    }
                }
            } else if (action === 'close') {
                hide(modal.id);
            }
        });
    }
    
    /**
     * Attach add drink modal handlers
     */
    function attachAddDrinkHandlers(modal) {
        const addBtn = modal.querySelector('[data-action="add"]');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const form = modal.querySelector('.drink-form');
        
        if (addBtn) {
            addBtn.addEventListener('click', async function() {
                // Validate form
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }
                
                const formData = new FormData(form);
                const drinkData = {
                    name: formData.get('name'),
                    minimum_price: parseFloat(formData.get('minimum_price')),
                    price_step_size: parseFloat(formData.get('price_step_size'))
                };
                
                // Set current_price to minimum_price if not provided
                drinkData.current_price = drinkData.minimum_price;
                
                try {
                    addBtn.disabled = true;
                    addBtn.textContent = 'Adding...';
                    
                    if (window.APIClient) {
                        const response = await window.APIClient.post('/api/drinks', drinkData);
                        if (response.success) {
                            console.log('Drink added successfully:', response.data);
                            
                            // Show success notification
                            if (window.StateManager) {
                                window.StateManager.addNotification('success', `Drink "${response.data.name}" added successfully`);
                            }
                            
                            // Refresh drinks data
                            if (window.AdminPage) {
                                await window.AdminPage.refresh();
                            }
                            
                            hide(modal.id);
                        } else {
                            throw new Error(response.error || response.message || 'Failed to add drink');
                        }
                    } else {
                        throw new Error('API client not available');
                    }
                } catch (error) {
                    console.error('Failed to add drink:', error);
                    
                    // Show error notification
                    if (window.StateManager) {
                        window.StateManager.addNotification('error', `Failed to add drink: ${error.message}`);
                    } else {
                        alert(`Failed to add drink: ${error.message}`);
                    }
                } finally {
                    addBtn.disabled = false;
                    addBtn.textContent = '+ Add Drink';
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => hide(modal.id));
        }
        
        // Add form validation
        setupFormValidation(form);
    }
    
    /**
     * Attach edit drink modal handlers
     */
    function attachEditDrinkHandlers(modal, data) {
        const saveBtn = modal.querySelector('[data-action="save"]');
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const deleteBtn = modal.querySelector('[data-action="delete"]');
        const form = modal.querySelector('.drink-form');
        
        if (saveBtn) {
            saveBtn.addEventListener('click', async function() {
                // Validate form
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return;
                }
                
                const formData = new FormData(form);
                const drinkData = {
                    name: formData.get('name'),
                    minimum_price: parseFloat(formData.get('minimum_price')),
                    current_price: parseFloat(formData.get('current_price')),
                    price_step_size: parseFloat(formData.get('price_step_size'))
                };
                
                const drinkId = formData.get('id') || data.drinkId;
                
                try {
                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Saving...';
                    
                    if (window.APIClient) {
                        const response = await window.APIClient.put(`/api/drinks/${drinkId}`, drinkData);
                        if (response.success) {
                            console.log('Drink updated successfully:', response.data);
                            
                            // Show success notification
                            if (window.StateManager) {
                                window.StateManager.addNotification('success', `Drink "${response.data.name}" updated successfully`);
                            }
                            
                            // Refresh drinks data
                            if (window.AdminPage) {
                                await window.AdminPage.refresh();
                            }
                            
                            hide(modal.id);
                        } else {
                            throw new Error(response.error || response.message || 'Failed to update drink');
                        }
                    } else {
                        throw new Error('API client not available');
                    }
                } catch (error) {
                    console.error('Failed to update drink:', error);
                    
                    // Show error notification
                    if (window.StateManager) {
                        window.StateManager.addNotification('error', `Failed to update drink: ${error.message}`);
                    } else {
                        alert(`Failed to update drink: ${error.message}`);
                    }
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Changes';
                }
            });
        }
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => hide(modal.id));
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async function() {
                const drinkName = data.drink?.name || 'this drink';
                const confirmed = await confirm(`Are you sure you want to delete "${drinkName}"? This action cannot be undone.`);
                
                if (confirmed) {
                    const drinkId = data.drink?.id || data.drinkId;
                    
                    try {
                        deleteBtn.disabled = true;
                        deleteBtn.textContent = 'Deleting...';
                        
                        if (window.APIClient) {
                            const response = await window.APIClient.delete(`/api/drinks/${drinkId}`);
                            if (response.success) {
                                console.log('Drink deleted successfully');
                                
                                // Show success notification
                                if (window.StateManager) {
                                    window.StateManager.addNotification('success', response.message || 'Drink deleted successfully');
                                }
                                
                                // Refresh drinks data
                                if (window.AdminPage) {
                                    await window.AdminPage.refresh();
                                }
                                
                                hide(modal.id);
                            } else {
                                throw new Error(response.error || response.message || 'Failed to delete drink');
                            }
                        } else {
                            throw new Error('API client not available');
                        }
                    } catch (error) {
                        console.error('Failed to delete drink:', error);
                        
                        // Show error notification
                        if (window.StateManager) {
                            window.StateManager.addNotification('error', `Failed to delete drink: ${error.message}`);
                        } else {
                            alert(`Failed to delete drink: ${error.message}`);
                        }
                        
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = '🗑️ Delete Drink';
                    }
                }
            });
        }
        
        // Add form validation
        setupFormValidation(form);
    }
    
    /**
     * Setup form validation
     */
    function setupFormValidation(form) {
        if (!form) return;
        
        // Add real-time validation
        const inputs = form.querySelectorAll('input[required], input[type="number"]');
        inputs.forEach(input => {
            input.addEventListener('blur', function() {
                validateInput(this);
            });
            
            input.addEventListener('input', function() {
                // Clear previous validation state on input
                this.setCustomValidity('');
                this.classList.remove('is-invalid', 'is-valid');
            });
        });
    }
    
    /**
     * Validate individual input
     */
    function validateInput(input) {
        const value = input.value.trim();
        const type = input.type;
        const required = input.hasAttribute('required');
        
        // Reset validation state
        input.setCustomValidity('');
        input.classList.remove('is-invalid', 'is-valid');
        
        // Required field validation
        if (required && !value) {
            input.setCustomValidity('This field is required');
            input.classList.add('is-invalid');
            return false;
        }
        
        // Number validation
        if (type === 'number' && value) {
            const numValue = parseFloat(value);
            const min = parseFloat(input.min) || 0;
            const max = parseFloat(input.max) || Infinity;
            
            if (isNaN(numValue)) {
                input.setCustomValidity('Please enter a valid number');
                input.classList.add('is-invalid');
                return false;
            }
            
            if (numValue < min) {
                input.setCustomValidity(`Value must be at least ${min}`);
                input.classList.add('is-invalid');
                return false;
            }
            
            if (numValue > max) {
                input.setCustomValidity(`Value must be no more than ${max}`);
                input.classList.add('is-invalid');
                return false;
            }
        }
        
        // Text validation
        if (input.name === 'name' && value) {
            if (value.length < 2) {
                input.setCustomValidity('Name must be at least 2 characters long');
                input.classList.add('is-invalid');
                return false;
            }
            
            if (value.length > 50) {
                input.setCustomValidity('Name must be no more than 50 characters');
                input.classList.add('is-invalid');
                return false;
            }
        }
        
        // If we got here, input is valid
        if (value) {
            input.classList.add('is-valid');
        }
        return true;
    }
    
    /**
     * Reorder a drink up or down in the list
     */
    async function reorderDrink(drinkId, action) {
        if (!window.APIClient) {
            throw new Error('API client not available');
        }
        
        // Get current drinks
        const drinksResponse = await window.APIClient.get('/api/drinks');
        if (!drinksResponse.success) {
            throw new Error('Failed to get current drinks');
        }
        
        const drinks = drinksResponse.data.slice(); // Copy array
        
        // Find the drink to move
        const drinkIndex = drinks.findIndex(d => d.id === drinkId);
        if (drinkIndex === -1) {
            throw new Error('Drink not found');
        }
        
        let newIndex;
        if (action === 'move-up') {
            newIndex = Math.max(0, drinkIndex - 1);
        } else if (action === 'move-down') {
            newIndex = Math.min(drinks.length - 1, drinkIndex + 1);
        } else {
            throw new Error('Invalid action');
        }
        
        // Skip if no movement needed
        if (newIndex === drinkIndex) {
            return;
        }
        
        // Swap drinks
        const [movedDrink] = drinks.splice(drinkIndex, 1);
        drinks.splice(newIndex, 0, movedDrink);
        
        // Update positions
        const reorderData = {
            drinks: drinks.map((drink, index) => ({
                id: drink.id,
                list_position: index + 1
            }))
        };
        
        // Send reorder request
        const response = await window.APIClient.put('/api/drinks/reorder', reorderData);
        if (!response.success) {
            throw new Error(response.error || 'Failed to reorder drinks');
        }
    }
    
    /**
     * Update drink list modal content with new drinks data
     */
    function updateDrinkListModal(modal, drinks) {
        const tableBody = modal.querySelector('.drinks-table tbody');
        if (!tableBody) return;
        
        let drinksRows = '';
        drinks.forEach((drink, index) => {
            drinksRows += `
                <tr data-drink-id="${drink.id}">
                <td class="drink-name">${drink.name}</td>
                <td class="reorder-controls">
                <button class="reorder-btn up" data-action="move-up" data-drink-id="${drink.id}">↑</button>
                <button class="reorder-btn down" data-action="move-down" data-drink-id="${drink.id}">↓</button>
                </td>
                <td class="current-price">${parseFloat(drink.current_price || 0).toFixed(2)}</td>
                <td class="min-price">${parseFloat(drink.minimum_price || 0).toFixed(2)}</td>
                <td class="actions">
                    <button class="action-btn edit" data-action="edit" data-drink-id="${drink.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="action-btn delete" data-action="delete" data-drink-id="${drink.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
                </tr>
            `;
        });
        
        tableBody.innerHTML = drinksRows;
        
        // Apply dynamic scaling based on updated drink count
        applyDrinkListModalScaling(modal, drinks.length);
    }

    // Public API
    return {
        /**
         * Initialize modal system
         */
        init: initialize,
        
        /**
         * Show modal
         */
        show: show,
        
        /**
         * Hide modal
         */
        hide: hide,
        
        /**
         * Toggle modal
         */
        toggle: toggle,
        
        /**
         * Create modal with content
         */
        create: createModal,
        
        /**
         * Show confirmation dialog
         */
        confirm: confirm,
        
        /**
         * Show alert dialog
         */
        alert: alert,
        
        /**
         * Check if modal is visible
         */
        isVisible: function(modalId) {
            const modal = document.getElementById(modalId);
            return modal && modal.classList.contains('show');
        },
        
        /**
         * Get modal instance
         */
        getInstance: function(modalId) {
            return modalInstances.get(modalId);
        },
        
        /**
         * Get all open modals
         */
        getOpenModals: function() {
            return [...modalStack];
        },
        
        /**
         * Close all modals
         */
        hideAll: function() {
            const promises = modalStack.map(instance => hide(instance.id));
            return Promise.all(promises);
        },
        
        /**
         * Configure modal system
         */
        configure: function(options) {
            Object.assign(config, options);
        },
        
        /**
         * Get configuration
         */
        getConfig: function() {
            return { ...config };
        },
        
        /**
         * Open specialized modal
         */
        open: function(modalType, data = {}) {
            return openSpecializedModal(modalType, data);
        },
        
        /**
         * Destroy modal system
         */
        destroy: function() {
            // Hide all modals
            this.hideAll();
            
            // Remove backdrop
            if (backdropElement) {
                backdropElement.remove();
                backdropElement = null;
            }
            
            // Clear instances
            modalInstances.clear();
            modalStack.length = 0;
            
            isInitialized = false;
        }
    };
})();