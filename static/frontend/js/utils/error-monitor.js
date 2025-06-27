/**
 * Abbey Stock Exchange v5 - Error Monitoring System
 * 
 * Comprehensive error monitoring, logging, and debugging utilities
 * for tracking and analyzing application errors.
 */

window.ErrorMonitor = (function() {
    'use strict';
    
    // Error tracking storage
    const errorLog = [];
    const maxLogSize = 100;
    let isEnabled = true;
    let debugMode = false;
    
    // Error statistics
    const stats = {
        totalErrors: 0,
        errorsByType: {},
        errorsByComponent: {},
        sessionStartTime: Date.now(),
        lastErrorTime: null
    };
    
    // Configuration
    const config = {
        enableConsoleLogging: true,
        enableLocalStorage: true,
        enableNotifications: false,
        maxStackDepth: 10,
        excludePatterns: [
            /Script error/,
            /Non-Error promise rejection/
        ]
    };
    
    /**
     * Initialize error monitoring
     */
    function initialize(options = {}) {
        Object.assign(config, options);
        
        // Set up global error handlers
        setupGlobalErrorHandlers();
        
        // Set up unhandled promise rejection handler
        setupPromiseRejectionHandler();
        
        // Set up performance monitoring
        setupPerformanceMonitoring();
        
        console.log('[ErrorMonitor] Initialized');
    }
    
    /**
     * Setup global error handlers
     */
    function setupGlobalErrorHandlers() {
        window.addEventListener('error', function(event) {
            logError('javascript_error', new Error(event.message), {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error ? event.error.stack : null
            });
        });
    }
    
    /**
     * Setup promise rejection handler
     */
    function setupPromiseRejectionHandler() {
        window.addEventListener('unhandledrejection', function(event) {
            logError('unhandled_promise_rejection', event.reason, {
                promise: event.promise,
                type: 'unhandled_rejection'
            });
        });
    }
    
    /**
     * Setup performance monitoring
     */
    function setupPerformanceMonitoring() {
        // Monitor long tasks
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach((entry) => {
                        if (entry.duration > 50) { // Long task threshold
                            logPerformanceIssue('long_task', {
                                duration: entry.duration,
                                startTime: entry.startTime,
                                name: entry.name
                            });
                        }
                    });
                });
                
                observer.observe({ entryTypes: ['longtask'] });
            } catch (error) {
                console.warn('[ErrorMonitor] Performance monitoring unavailable:', error);
            }
        }
    }
    
    /**
     * Log error with context
     */
    function logError(errorType, error, context = {}) {
        if (!isEnabled) return;
        
        // Check exclusion patterns
        const errorMessage = error?.message || String(error);
        const shouldExclude = config.excludePatterns.some(pattern => 
            pattern.test(errorMessage)
        );
        
        if (shouldExclude) return;
        
        // Create error entry
        const errorEntry = {
            id: generateErrorId(),
            timestamp: Date.now(),
            type: errorType,
            message: errorMessage,
            stack: error?.stack || null,
            context: context,
            userAgent: navigator.userAgent,
            url: window.location.href,
            sessionId: getSessionId()
        };
        
        // Add to error log
        addToErrorLog(errorEntry);
        
        // Update statistics
        updateErrorStats(errorType, context.component);
        
        // Console logging
        if (config.enableConsoleLogging) {
            console.error(`[ErrorMonitor] ${errorType}:`, error, context);
        }
        
        // Local storage persistence
        if (config.enableLocalStorage) {
            persistErrorLog();
        }
        
        // Show notification if enabled
        if (config.enableNotifications) {
            showErrorNotification(errorEntry);
        }
        
        // Trigger error event
        triggerErrorEvent(errorEntry);
    }
    
    /**
     * Log performance issue
     */
    function logPerformanceIssue(issueType, data) {
        const performanceEntry = {
            id: generateErrorId(),
            timestamp: Date.now(),
            type: 'performance_issue',
            subtype: issueType,
            data: data,
            url: window.location.href,
            sessionId: getSessionId()
        };
        
        addToErrorLog(performanceEntry);
        
        if (debugMode) {
            console.warn(`[ErrorMonitor] Performance issue - ${issueType}:`, data);
        }
    }
    
    /**
     * Add error to log with size management
     */
    function addToErrorLog(errorEntry) {
        errorLog.push(errorEntry);
        
        // Maintain log size
        if (errorLog.length > maxLogSize) {
            errorLog.shift();
        }
        
        stats.lastErrorTime = errorEntry.timestamp;
    }
    
    /**
     * Update error statistics
     */
    function updateErrorStats(errorType, component = 'unknown') {
        stats.totalErrors++;
        
        if (!stats.errorsByType[errorType]) {
            stats.errorsByType[errorType] = 0;
        }
        stats.errorsByType[errorType]++;
        
        if (!stats.errorsByComponent[component]) {
            stats.errorsByComponent[component] = 0;
        }
        stats.errorsByComponent[component]++;
    }
    
    /**
     * Generate unique error ID
     */
    function generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Get or create session ID
     */
    function getSessionId() {
        let sessionId = sessionStorage.getItem('abbey_session_id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('abbey_session_id', sessionId);
        }
        return sessionId;
    }
    
    /**
     * Persist error log to localStorage
     */
    function persistErrorLog() {
        try {
            const logData = {
                errors: errorLog.slice(-20), // Keep last 20 errors
                stats: stats,
                timestamp: Date.now()
            };
            localStorage.setItem('abbey_error_log', JSON.stringify(logData));
        } catch (error) {
            console.warn('[ErrorMonitor] Failed to persist error log:', error);
        }
    }
    
    /**
     * Load error log from localStorage
     */
    function loadPersistedErrorLog() {
        try {
            const logData = localStorage.getItem('abbey_error_log');
            if (logData) {
                const parsed = JSON.parse(logData);
                return parsed;
            }
        } catch (error) {
            console.warn('[ErrorMonitor] Failed to load persisted error log:', error);
        }
        return null;
    }
    
    /**
     * Show error notification
     */
    function showErrorNotification(errorEntry) {
        if (window.StateManager) {
            window.StateManager.addNotification('error', 
                `Error: ${errorEntry.message}`, 
                { duration: 5000 }
            );
        }
    }
    
    /**
     * Trigger error event for external handlers
     */
    function triggerErrorEvent(errorEntry) {
        const errorEvent = new CustomEvent('error:logged', {
            detail: errorEntry
        });
        document.dispatchEvent(errorEvent);
    }
    
    /**
     * Get error summary
     */
    function getErrorSummary() {
        const sessionDuration = Date.now() - stats.sessionStartTime;
        const errorRate = stats.totalErrors / (sessionDuration / 1000); // errors per second
        
        return {
            sessionDuration: sessionDuration,
            totalErrors: stats.totalErrors,
            errorRate: errorRate,
            errorsByType: { ...stats.errorsByType },
            errorsByComponent: { ...stats.errorsByComponent },
            recentErrors: errorLog.slice(-5),
            lastErrorTime: stats.lastErrorTime
        };
    }
    
    /**
     * Export error log for debugging
     */
    function exportErrorLog() {
        const exportData = {
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            sessionId: getSessionId(),
            summary: getErrorSummary(),
            fullLog: errorLog,
            stats: stats
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    /**
     * Clear error log
     */
    function clearErrorLog() {
        errorLog.length = 0;
        stats.totalErrors = 0;
        stats.errorsByType = {};
        stats.errorsByComponent = {};
        stats.lastErrorTime = null;
        
        if (config.enableLocalStorage) {
            localStorage.removeItem('abbey_error_log');
        }
        
        console.log('[ErrorMonitor] Error log cleared');
    }
    
    /**
     * Enable/disable error monitoring
     */
    function setEnabled(enabled) {
        isEnabled = enabled;
        console.log(`[ErrorMonitor] ${enabled ? 'Enabled' : 'Disabled'}`);
    }
    
    /**
     * Enable/disable debug mode
     */
    function setDebugMode(enabled) {
        debugMode = enabled;
        console.log(`[ErrorMonitor] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    // Auto-initialize
    document.addEventListener('DOMContentLoaded', function() {
        initialize();
    });
    
    // Public API
    return {
        /**
         * Initialize error monitoring
         */
        init: initialize,
        
        /**
         * Log custom error
         */
        logError: logError,
        
        /**
         * Log performance issue
         */
        logPerformanceIssue: logPerformanceIssue,
        
        /**
         * Get error summary
         */
        getSummary: getErrorSummary,
        
        /**
         * Get recent errors
         */
        getRecentErrors: function(count = 10) {
            return errorLog.slice(-count);
        },
        
        /**
         * Get all errors
         */
        getAllErrors: function() {
            return [...errorLog];
        },
        
        /**
         * Export error log
         */
        export: exportErrorLog,
        
        /**
         * Clear error log
         */
        clear: clearErrorLog,
        
        /**
         * Enable/disable monitoring
         */
        setEnabled: setEnabled,
        
        /**
         * Enable/disable debug mode
         */
        setDebugMode: setDebugMode,
        
        /**
         * Configure monitoring
         */
        configure: function(options) {
            Object.assign(config, options);
        },
        
        /**
         * Check if monitoring is enabled
         */
        isEnabled: function() {
            return isEnabled;
        },
        
        /**
         * Get configuration
         */
        getConfig: function() {
            return { ...config };
        },
        
        /**
         * Get statistics
         */
        getStats: function() {
            return { ...stats };
        }
    };
})();