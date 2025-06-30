#!/bin/bash

#
# Application Startup Script
# 
# Function: Starts Python application with virtual environment activation and launches browser
#           Only starts server if not already running
# 
# Usage: ./start_app.sh (called automatically by git-repo-monitor or desktop startup)
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial application startup script template
# • 2025-06-30: Configured for Python app with virtual environment
# • 2025-06-30: Added Chromium browser launch for kiosk mode
# • 2025-06-30: Added smart server detection to prevent duplicate instances
#

# Configuration
APP_PORT=5001  # Change this to match your Flask app port
APP_NAME="app.py"

# Set up environment variables
export PATH=$PATH:/usr/local/bin
export DISPLAY=:0

# Function to check if server is already running
is_server_running() {
    # Check if anything is listening on the app port
    if netstat -tuln 2>/dev/null | grep -q ":$APP_PORT "; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Server already running on port $APP_PORT"
        return 0
    fi
    
    # Alternative check using lsof if netstat isn't available
    if command -v lsof >/dev/null 2>&1; then
        if lsof -i :$APP_PORT >/dev/null 2>&1; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Server already running on port $APP_PORT (detected via lsof)"
            return 0
        fi
    fi
    
    # Check for Python process running our app
    if pgrep -f "python.*$APP_NAME" >/dev/null 2>&1; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Python process for $APP_NAME already running"
        return 0
    fi
    
    return 1
}

# Function to check if browser is already running
is_browser_running() {
    if pgrep -f "chromium.*127.0.0.1:$APP_PORT" >/dev/null 2>&1; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser already running for our app"
        return 0
    fi
    return 1
}

# Function to wait for server to be ready
wait_for_server() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for server to be ready..."
    for i in {1..30}; do
        if curl -s "http://127.0.0.1:$APP_PORT" >/dev/null 2>&1; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Server is responding on port $APP_PORT"
            return 0
        fi
        sleep 1
    done
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WARNING: Server not responding after 30 seconds"
    return 1
}

# Log startup
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application from $(pwd)"

# Verify we're in the correct directory
if [ ! -f "$APP_NAME" ] || [ ! -d "venv" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Not in correct app directory. Current: $(pwd)"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Expected files: $APP_NAME and venv/ directory"
    exit 1
fi

# Check if server is already running
if is_server_running; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Server already running, skipping server startup"
    SERVER_STARTED=false
    APP_PID="existing"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - No existing server found, starting new instance"
    
    # Activate virtual environment and run Python application
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Activating virtual environment..."
    source venv/bin/activate
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application ($APP_NAME) in background..."
    python $APP_NAME &
    APP_PID=$!
    SERVER_STARTED=true
    
    # Wait a moment for startup
    sleep 3
    
    # Check if our new Python process is still running
    if [ "$SERVER_STARTED" = true ] && ! kill -0 $APP_PID 2>/dev/null; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Python application failed to start"
        exit 1
    fi
fi

# Wait for server to be ready (whether new or existing)
wait_for_server

# Check if browser should be launched
if is_browser_running; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser already running for our app, skipping browser launch"
    BROWSER_PID="existing"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Launching Chromium browser..."
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
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser launched with PID: $BROWSER_PID"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Startup process completed successfully!"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Python app PID: $APP_PID"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser PID: $BROWSER_PID"

# Only wait if we started new processes
if [ "$SERVER_STARTED" = true ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Keeping script running to maintain server process"
    wait $APP_PID
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Script completed - server was already running"
fi