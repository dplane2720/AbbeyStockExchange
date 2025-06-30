#!/bin/bash

#
# Application Startup Script
# 
# Function: Starts Python application with virtual environment activation
# 
# Usage: ./start_app.sh (called automatically by git-repo-monitor)
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial application startup script template
# • 2025-06-30: Configured for Python app with virtual environment
#

# Set up environment variables if needed
export PATH=$PATH:/usr/local/bin

# Log startup
echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application from $(pwd)"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Virtual environment 'venv' not found in $(pwd)"
    exit 1
fi

# Check if app.py exists
if [ ! -f "app.py" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR: Application file 'app.py' not found in $(pwd)"
    exit 1
fi

# Activate virtual environment and run Python application
echo "$(date '+%Y-%m-%d %H:%M:%S') - Activating virtual environment..."
source venv/bin/activate

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting Python application (app.py)..."
python app.py &

# Launch Chromium browser in kiosk mode
echo "$(date '+%Y-%m-%d %H:%M:%S') - Launching Chromium browser..."
chromium-browser \
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
    http://127.0.0.1:5001/display &  # Adjust port if needed

