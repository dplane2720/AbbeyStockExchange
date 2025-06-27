/**
 * Abbey Stock Exchange v5 - API Client
 * 
 * Comprehensive REST API client for communicating with the backend.
 * Provides consistent interface, error handling, request/response
 * interceptors, and automatic retry logic.
 */

window.APIClient = (function() {
    'use strict';
    
    const BASE_URL = '/api';
    const DEFAULT_TIMEOUT = 10000;
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000;
    
    let defaultHeaders = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    
    let requestInterceptors = [];
    let responseInterceptors = [];
    let errorHandlers = [];
    
    /**
     * Sleep utility for retry delays
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Create timeout promise
     */
    function createTimeoutPromise(ms) {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), ms);
        });
    }
    
    /**
     * Check if error is retryable
     */
    function isRetryableError(error) {
        // Retry on network errors and 5xx server errors
        return (
            error.name === 'TypeError' || // Network error
            error.message.includes('timeout') ||
            (error.status >= 500 && error.status < 600)
        );
    }
    
    /**
     * Apply request interceptors
     */
    function applyRequestInterceptors(url, options) {
        let modifiedOptions = { ...options };
        
        requestInterceptors.forEach(interceptor => {
            try {
                const result = interceptor(url, modifiedOptions);
                if (result) {
                    modifiedOptions = result;
                }
            } catch (error) {
                console.warn('[ApiClient] Request interceptor error:', error);
            }
        });
        
        return modifiedOptions;
    }
    
    /**
     * Apply response interceptors
     */
    function applyResponseInterceptors(response, url, options) {
        let modifiedResponse = response;
        
        responseInterceptors.forEach(interceptor => {
            try {
                const result = interceptor(modifiedResponse, url, options);
                if (result) {
                    modifiedResponse = result;
                }
            } catch (error) {
                console.warn('[ApiClient] Response interceptor error:', error);
            }
        });
        
        return modifiedResponse;
    }
    
    /**
     * Apply error handlers
     */
    function applyErrorHandlers(error, url, options) {
        errorHandlers.forEach(handler => {
            try {
                handler(error, url, options);
            } catch (handlerError) {
                console.warn('[ApiClient] Error handler error:', handlerError);
            }
        });
    }
    
    /**
     * Make HTTP request with comprehensive error handling and retry logic
     * @param {string} url - Request URL
     * @param {Object} options - Fetch options
     * @returns {Promise} Response promise
     */
    async function makeRequest(url, options = {}) {
        const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
        
        // Set default options
        const requestOptions = {
            headers: { ...defaultHeaders },
            timeout: DEFAULT_TIMEOUT,
            ...options
        };
        
        // Apply request interceptors
        const interceptedOptions = applyRequestInterceptors(fullUrl, requestOptions);
        
        // Extract timeout from options
        const timeout = interceptedOptions.timeout || DEFAULT_TIMEOUT;
        delete interceptedOptions.timeout;
        
        let lastError;
        
        // Retry loop
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Create fetch promise with timeout
                const fetchPromise = fetch(fullUrl, interceptedOptions);
                const timeoutPromise = createTimeoutPromise(timeout);
                
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                
                // Check if response is ok
                if (!response.ok) {
                    const errorData = await response.text();
                    let parsedError;
                    
                    try {
                        parsedError = JSON.parse(errorData);
                    } catch {
                        parsedError = { message: errorData };
                    }
                    
                    const error = new Error(parsedError.message || `HTTP ${response.status}`);
                    error.status = response.status;
                    error.statusText = response.statusText;
                    error.data = parsedError;
                    error.response = response;
                    
                    throw error;
                }
                
                // Parse response
                const contentType = response.headers.get('content-type');
                let data;
                
                if (contentType && contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }
                
                // Apply response interceptors
                const interceptedResponse = applyResponseInterceptors(data, fullUrl, interceptedOptions);
                
                return interceptedResponse;
                
            } catch (error) {
                lastError = error;
                
                // Apply error handlers
                applyErrorHandlers(error, fullUrl, interceptedOptions);
                
                // Check if we should retry
                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    console.warn(`[ApiClient] Request failed, retrying (${attempt + 1}/${MAX_RETRIES}):`, error.message);
                    await sleep(RETRY_DELAY * (attempt + 1)); // Exponential backoff
                    continue;
                }
                
                // No more retries, throw the error
                throw error;
            }
        }
        
        throw lastError;
    }
    
    /**
     * GET request helper
     */
    function get(url, options = {}) {
        return makeRequest(url, {
            method: 'GET',
            ...options
        });
    }
    
    /**
     * POST request helper
     */
    function post(url, data = null, options = {}) {
        return makeRequest(url, {
            method: 'POST',
            body: data ? JSON.stringify(data) : null,
            ...options
        });
    }
    
    /**
     * PUT request helper
     */
    function put(url, data = null, options = {}) {
        return makeRequest(url, {
            method: 'PUT',
            body: data ? JSON.stringify(data) : null,
            ...options
        });
    }
    
    /**
     * DELETE request helper
     */
    function del(url, options = {}) {
        return makeRequest(url, {
            method: 'DELETE',
            ...options
        });
    }
    
    /**
     * PATCH request helper
     */
    function patch(url, data = null, options = {}) {
        return makeRequest(url, {
            method: 'PATCH',
            body: data ? JSON.stringify(data) : null,
            ...options
        });
    }
    
    // Public API
    return {
        /**
         * Raw request method
         */
        request: makeRequest,
        
        /**
         * HTTP method helpers
         */
        get,
        post,
        put,
        delete: del,
        patch,
        
        /**
         * Drinks API endpoints
         */
        drinks: {
            /**
             * Get all drinks
             */
            getAll: function() {
                return get(`${BASE_URL}/drinks`);
            },
            
            /**
             * Get drink by ID
             */
            get: function(id) {
                return get(`${BASE_URL}/drinks/${id}`);
            },
            
            /**
             * Create new drink
             */
            create: function(drinkData) {
                return post(`${BASE_URL}/drinks`, drinkData);
            },
            
            /**
             * Update drink
             */
            update: function(id, drinkData) {
                return put(`${BASE_URL}/drinks/${id}`, drinkData);
            },
            
            /**
             * Delete drink
             */
            delete: function(id) {
                return del(`${BASE_URL}/drinks/${id}`);
            },
            
            /**
             * Record drink sale
             */
            recordSale: function(id, quantity = 1) {
                return post(`${BASE_URL}/drinks/${id}/sales`, { quantity });
            },
            
            /**
             * Reorder drinks
             */
            reorder: function(drinkIds) {
                return post(`${BASE_URL}/drinks/reorder`, { drink_ids: drinkIds });
            }
        },
        
        /**
         * Settings API endpoints
         */
        settings: {
            /**
             * Get all settings
             */
            get: function() {
                return get(`${BASE_URL}/settings`);
            },
            
            /**
             * Update settings
             */
            update: function(settingsData) {
                return put(`${BASE_URL}/settings`, settingsData);
            },
            
            /**
             * Get refresh cycle
             */
            getRefreshCycle: function() {
                return get(`${BASE_URL}/settings/refresh-cycle`);
            },
            
            /**
             * Update refresh cycle
             */
            updateRefreshCycle: function(cycle) {
                return put(`${BASE_URL}/settings/refresh-cycle`, { refresh_cycle: cycle });
            },
            
            /**
             * Get system status
             */
            getStatus: function() {
                return get(`${BASE_URL}/settings/status`);
            }
        },
        
        /**
         * Backup API endpoints
         */
        backups: {
            /**
             * Get all backups
             */
            getAll: function() {
                return get(`${BASE_URL}/backups`);
            },
            
            /**
             * Create new backup
             */
            create: function(description = '') {
                return post(`${BASE_URL}/backups`, { description });
            },
            
            /**
             * Get backup details
             */
            get: function(backupName) {
                return get(`${BASE_URL}/backups/${backupName}`);
            },
            
            /**
             * Restore from backup
             */
            restore: function(backupName, options = {}) {
                return post(`${BASE_URL}/backups/${backupName}/restore`, options);
            },
            
            /**
             * Validate backup
             */
            validate: function(backupName) {
                return post(`${BASE_URL}/backups/${backupName}/validate`);
            },
            
            /**
             * Delete backup
             */
            delete: function(backupName) {
                return del(`${BASE_URL}/backups/${backupName}`);
            }
        },
        
        /**
         * Health check endpoint
         */
        health: function() {
            return get(`${BASE_URL}/health`);
        },
        
        /**
         * Configuration methods
         */
        config: {
            /**
             * Set default headers
             */
            setDefaultHeaders: function(headers) {
                defaultHeaders = { ...defaultHeaders, ...headers };
            },
            
            /**
             * Get default headers
             */
            getDefaultHeaders: function() {
                return { ...defaultHeaders };
            },
            
            /**
             * Set base URL
             */
            setBaseUrl: function(url) {
                BASE_URL = url;
            },
            
            /**
             * Get base URL
             */
            getBaseUrl: function() {
                return BASE_URL;
            }
        },
        
        /**
         * Interceptor methods
         */
        interceptors: {
            /**
             * Add request interceptor
             */
            addRequest: function(interceptor) {
                requestInterceptors.push(interceptor);
            },
            
            /**
             * Add response interceptor
             */
            addResponse: function(interceptor) {
                responseInterceptors.push(interceptor);
            },
            
            /**
             * Add error handler
             */
            addError: function(handler) {
                errorHandlers.push(handler);
            },
            
            /**
             * Clear all interceptors
             */
            clear: function() {
                requestInterceptors = [];
                responseInterceptors = [];
                errorHandlers = [];
            }
        },
        
        /**
         * Utility methods
         */
        utils: {
            /**
             * Build query string from object
             */
            buildQueryString: function(params) {
                return Object.entries(params)
                    .filter(([_, value]) => value !== null && value !== undefined)
                    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
                    .join('&');
            },
            
            /**
             * Append query string to URL
             */
            appendQueryString: function(url, params) {
                if (!params || Object.keys(params).length === 0) {
                    return url;
                }
                
                const queryString = this.buildQueryString(params);
                const separator = url.includes('?') ? '&' : '?';
                return `${url}${separator}${queryString}`;
            },
            
            /**
             * Check if response indicates success
             */
            isSuccessResponse: function(response) {
                return response && response.success === true;
            },
            
            /**
             * Extract error message from response
             */
            getErrorMessage: function(error) {
                if (error.data && error.data.message) {
                    return error.data.message;
                }
                
                if (error.message) {
                    return error.message;
                }
                
                return 'An unknown error occurred';
            }
        },
        
        /**
         * Debug methods
         */
        debug: {
            /**
             * Get configuration info
             */
            getConfig: function() {
                return {
                    baseUrl: BASE_URL,
                    defaultHeaders,
                    requestInterceptors: requestInterceptors.length,
                    responseInterceptors: responseInterceptors.length,
                    errorHandlers: errorHandlers.length
                };
            },
            
            /**
             * Test API connectivity
             */
            testConnection: function() {
                return get(`${BASE_URL}/health`)
                    .then(response => ({
                        connected: true,
                        response
                    }))
                    .catch(error => ({
                        connected: false,
                        error: error.message
                    }));
            }
        }
    };
})();