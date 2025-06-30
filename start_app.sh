#!/bin/bash

#
# Application Startup Script
# 
# Function: Starts Python application with virtual environment activation and launches browser
# 
# Usage: ./start_app.sh (called automatically by git-repo-monitor)
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial application startup script template
# • 2025-06-30: Configured for Python app with virtual environment
# • 2025-06-30: Added Chromium browser launch for kiosk mode
# • 2025-06-30: Added desktop session detection for GUI applications
#

# Set up environment variables
export PATH=$PATH:/usr/local/bin

# Function to wait for desktop session
wait_for_desktop() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for desktop session..."
    
    # Wait up to 60 seconds for X server to be available
    for i in {1..60}; do
        if xset q &>/dev/null 2>&1; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') - Desktop session detected"
            export DISPLAY=:0
            return 0
        fi
        sleep 1
    done
    
    echo "$(date '+%Y-%m-%d %H:%M:%S') - WARNING: No desktop session found, browser will not launch"
    return 1
}

# Log startup
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application from $(pwd)"

# Verify we're in the correct directory (should contain app.py and venv)
if [ ! -f "app.py" ] || [ ! -d "venv" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Not in correct app directory. Current: $(pwd)"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Expected files: app.py and venv/ directory"
    exit 1
fi

# Activate virtual environment and run Python application in background
echo "$(date '+%Y-%m-%d %H:%M:%S') - Activating virtual environment..."
source venv/bin/activate

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application (app.py) in background..."
python app.py &
APP_PID=$!

# Wait for app to start up (adjust time as needed)
echo "$(date '+%Y-%m-%d %H:%M:%S') - Waiting for application to start..."
sleep 5

# Check if Python app is still running
if ! kill -0 $APP_PID 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Python application failed to start"
    exit 1
fi

# Wait for desktop session and launch browser if available
if wait_for_desktop; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Launching Chromium browser..."
    
    # Run browser as the desktop user (usually orangepi)
    sudo -u orangepi DISPLAY=:0 chromium \
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
        http://127.0.0.1:5000 &
    
    BROWSER_PID=$!
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser launched with PID: $BROWSER_PID"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Skipping browser launch - no desktop session"
    BROWSER_PID="N/A"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Application started successfully!"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Python app PID: $APP_PID"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Browser PID: $BROWSER_PID"

# Keep the script running to maintain both processes
wait