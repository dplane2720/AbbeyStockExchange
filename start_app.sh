#!/bin/bash

#
# Unified Application Startup Script
# 
# Function: Checks repository for updates, then starts Python application and browser
#           Only starts components if not already running
# 
# Usage: ./start_app.sh (called at boot via systemd or desktop startup)
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial application startup script template
# • 2025-06-30: Configured for Python app with virtual environment
# • 2025-06-30: Added Chromium browser launch for kiosk mode
# • 2025-06-30: Added smart server detection to prevent duplicate instances
# • 2025-06-30: Integrated repository monitoring and update functionality
#

# ================== CONFIGURATION ==================
REPO_URL="https://github.com/dplane2720/AbbeyStockExchange.git"
BRANCH="main"
APP_PORT=5001
APP_NAME="app.py"
LOG_FILE="/var/log/git-repo-monitor.log"

# Get the directory where this script is located (should be repo root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PATH="$SCRIPT_DIR"

# ================== LOGGING FUNCTION ==================
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# ================== REPOSITORY FUNCTIONS ==================
get_remote_hash() {
    git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | cut -f1
}

get_local_hash() {
    if [ -d "$REPO_PATH/.git" ]; then
        cd "$REPO_PATH"
        git rev-parse HEAD 2>/dev/null
    else
        echo "no_local_repo"
    fi
}

wait_for_network() {
    log_message "Waiting for network connectivity..."
    for i in {1..30}; do
        if ping -c 1 github.com &> /dev/null; then
            log_message "Network connectivity confirmed"
            return 0
        fi
        if [ $i -eq 30 ]; then
            log_message "ERROR: Network not available after 30 attempts"
            return 1
        fi
        sleep 2
    done
}

stop_existing_app() {
    if [ -f "/var/run/monitored-app.pid" ]; then
        OLD_PID=$(cat /var/run/monitored-app.pid)
        if kill -0 "$OLD_PID" 2>/dev/null; then
            log_message "Stopping existing application with PID $OLD_PID for update"
            kill "$OLD_PID"
            sleep 3
            if kill -0 "$OLD_PID" 2>/dev/null; then
                log_message "Force stopping application with PID $OLD_PID"
                kill -9 "$OLD_PID"
            fi
        fi
        rm -f /var/run/monitored-app.pid
    fi
}

check_and_update_repo() {
    log_message "=== REPOSITORY UPDATE CHECK ==="
    
    # Wait for network
    if ! wait_for_network; then
        log_message "WARNING: No network connectivity, skipping repository check"
        return 1
    fi
    
    # Get remote commit hash
    REMOTE_HASH=$(get_remote_hash)
    if [ -z "$REMOTE_HASH" ]; then
        log_message "ERROR: Failed to fetch remote commit hash"
        return 1
    fi
    
    log_message "Remote HEAD commit: $REMOTE_HASH"
    
    # Get local commit hash
    LOCAL_HASH=$(get_local_hash)
    log_message "Local HEAD commit: $LOCAL_HASH"
    
    # Compare and update if needed
    if [ "$LOCAL_HASH" = "no_local_repo" ]; then
        log_message "ERROR: Not running from a git repository"
        return 1
        
    elif [ "$REMOTE_HASH" != "$LOCAL_HASH" ]; then
        log_message "Repository update detected! Updating..."
        
        # Stop existing application before updating
        stop_existing_app
        
        cd "$REPO_PATH"
        
        # Fetch and pull latest changes
        if git fetch origin "$BRANCH" && git reset --hard "origin/$BRANCH"; then
            log_message "SUCCESS: Repository updated to commit $REMOTE_HASH"
            return 2  # Signal that update occurred
        else
            log_message "ERROR: Failed to update repository"
            return 1
        fi
        
    else
        log_message "Repository is up to date"
        return 0
    fi
}

# ================== APPLICATION FUNCTIONS ==================
is_server_running() {
    # Check if anything is listening on the app port
    if netstat -tuln 2>/dev/null | grep -q ":$APP_PORT "; then
        return 0
    fi
    
    # Alternative check using lsof
    if command -v lsof >/dev/null 2>&1; then
        if lsof -i :$APP_PORT >/dev/null 2>&1; then
            return 0
        fi
    fi
    
    # Check for Python process running our app
    if pgrep -f "python.*$APP_NAME" >/dev/null 2>&1; then
        return 0
    fi
    
    return 1
}

is_browser_running() {
    if pgrep -f "chromium.*127.0.0.1:$APP_PORT" >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

wait_for_server() {
    log_message "Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s "http://127.0.0.1:$APP_PORT" >/dev/null 2>&1; then
            log_message "Server is responding on port $APP_PORT"
            return 0
        fi
        sleep 1
    done
    log_message "WARNING: Server not responding after 30 seconds"
    return 1
}

start_server() {
    log_message "=== STARTING APPLICATION SERVER ==="
    
    # Verify we're in the correct directory
    if [ ! -f "$APP_NAME" ] || [ ! -d "venv" ]; then
        log_message "ERROR: Required files not found. Current: $(pwd)"
        log_message "Expected: $APP_NAME and venv/ directory"
        return 1
    fi
    
    # Check if server is already running
    if is_server_running; then
        log_message "Server already running on port $APP_PORT, skipping startup"
        return 0
    fi
    
    log_message "Starting new server instance"
    
    # Activate virtual environment and start server
    log_message "Activating virtual environment..."
    source venv/bin/activate
    
    log_message "Starting Python application ($APP_NAME) in background..."
    python $APP_NAME &
    APP_PID=$!
    
    # Save PID for monitoring
    echo "$APP_PID" > /var/run/monitored-app.pid
    
    # Wait and verify startup
    sleep 3
    if ! kill -0 $APP_PID 2>/dev/null; then
        log_message "ERROR: Python application failed to start"
        return 1
    fi
    
    log_message "SUCCESS: Server started with PID $APP_PID"
    return 0
}

start_browser() {
    log_message "=== STARTING BROWSER ==="
    
    # Set up display environment
    export DISPLAY=:0
    
    # Check if browser is already running
    if is_browser_running; then
        log_message "Browser already running for our app, skipping launch"
        return 0
    fi
    
    # Wait for server to be ready
    if ! wait_for_server; then
        log_message "ERROR: Server not ready, cannot launch browser"
        return 1
    fi
    
    log_message "Launching Chromium browser in kiosk mode..."
    chromium \
        --no-first-run \
        --disable-translate \
        --disable-infobars \
        --disable-suggestions-service \
        --disable-save-password-bubble \
        --start-maximized \
        --kiosk \
        --disable-session-crashed-bubble \
        --incognito \
        --no-sandbox \
        --disable-dev-shm-usage \
        "http://127.0.0.1:$APP_PORT" &
    
    BROWSER_PID=$!
    log_message "SUCCESS: Browser launched with PID $BROWSER_PID"
    return 0
}

# ================== MAIN EXECUTION ==================
main() {
    log_message "========================================="
    log_message "UNIFIED STARTUP SCRIPT STARTING"
    log_message "Repository: $REPO_URL"
    log_message "Working Directory: $REPO_PATH"
    log_message "========================================="
    
    # Change to repository directory
    cd "$REPO_PATH"
    
    # Check and update repository
    check_and_update_repo
    REPO_STATUS=$?
    
    # Start server (always attempt, it will check if already running)
    if start_server; then
        SERVER_STARTED=true
    else
        log_message "ERROR: Failed to start server"
        exit 1
    fi
    
    # Start browser (always attempt, it will check if already running)
    if start_browser; then
        BROWSER_STARTED=true
    else
        log_message "WARNING: Failed to start browser (server still running)"
    fi
    
    log_message "========================================="
    log_message "STARTUP COMPLETED SUCCESSFULLY"
    log_message "Repository Status: $([ $REPO_STATUS -eq 2 ] && echo 'UPDATED' || echo 'UP-TO-DATE')"
    log_message "Server: $([ "$SERVER_STARTED" = true ] && echo 'RUNNING' || echo 'ALREADY RUNNING')"
    log_message "Browser: $([ "$BROWSER_STARTED" = true ] && echo 'LAUNCHED' || echo 'ALREADY RUNNING')"
    log_message "========================================="
    
    # Keep script running if we started the server
    if [ "$SERVER_STARTED" = true ] && [ -f "/var/run/monitored-app.pid" ]; then
        APP_PID=$(cat /var/run/monitored-app.pid)
        if kill -0 "$APP_PID" 2>/dev/null; then
            log_message "Keeping script running to maintain server process (PID: $APP_PID)"
            wait $APP_PID
        fi
    else
        log_message "Script completed - server was already running"
    fi
}

# Execute main function
main "$@"