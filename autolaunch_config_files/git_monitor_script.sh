#!/bin/bash

#
# Git Repository Boot Monitor Script
# 
# Function: Checks a specified GitHub repository for updates at system boot and 
#           automatically clones or pulls the latest version when changes are detected.
# 
# Usage: ./git-repo-monitor.sh (runs once at boot via systemd)
#        Configure variables below before running
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial script creation with remote hash comparison logic
#

# Configuration variables - modify these for your specific repository
REPO_URL="https://github.com/dplane2720/AbbeyStockExchange.git"  # Replace with your repo URL
LOCAL_PATH="/home/orangepi/monitored-AbbeyStockExchange/"  # Local clone destination
BRANCH="main"  # Branch to monitor (main, master, develop, etc.)
LOG_FILE="/var/log/git-repo-monitor.log"

# Application launch configuration
APP_SCRIPT="$LOCAL_PATH/app_startup_script.sh"  # Path to your app startup script
APP_WORKING_DIR="$LOCAL_PATH"  # Working directory for app execution
LAUNCH_APP=true  # Set to false to disable app launch
APP_USER="$(whoami)"  # User to run the app as

# Function to log messages with timestamp
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to get remote commit hash
get_remote_hash() {
    git ls-remote "$REPO_URL" "refs/heads/$BRANCH" | cut -f1
}

# Function to launch application
launch_application() {
    if [ "$LAUNCH_APP" = true ]; then
        log_message "Preparing to launch application..."
        
        # Check if app script exists
        if [ ! -f "$APP_SCRIPT" ]; then
            log_message "ERROR: Application script not found at $APP_SCRIPT"
            return 1
        fi
        
        # Make app script executable
        chmod +x "$APP_SCRIPT"
        
        # Change to app working directory
        cd "$APP_WORKING_DIR"
        
        log_message "Launching application from $APP_SCRIPT"
        
        # Launch application in background and capture PID
        nohup "$APP_SCRIPT" > /var/log/app-output.log 2>&1 &
        APP_PID=$!
        
        # Wait briefly to check if app started successfully
        sleep 2
        if kill -0 "$APP_PID" 2>/dev/null; then
            log_message "SUCCESS: Application launched successfully with PID $APP_PID"
            echo "$APP_PID" > /var/run/monitored-app.pid
        else
            log_message "ERROR: Application failed to start or exited immediately"
            return 1
        fi
    else
        log_message "Application launch disabled (LAUNCH_APP=false)"
    fi
}
get_local_hash() {
    if [ -d "$LOCAL_PATH/.git" ]; then
        cd "$LOCAL_PATH"
        git rev-parse HEAD
    else
        echo "no_local_repo"
    fi
}

# Main monitoring logic with network wait
main() {
    log_message "Starting boot repository check for $REPO_URL"
    
    # Wait for network connectivity (important for Pi boot sequence)
    log_message "Waiting for network connectivity..."
    for i in {1..30}; do
        if ping -c 1 github.com &> /dev/null; then
            log_message "Network connectivity confirmed"
            break
        fi
        if [ $i -eq 30 ]; then
            log_message "ERROR: Network not available after 30 attempts"
            exit 1
        fi
        sleep 2
    done
    
    # Get remote commit hash
    REMOTE_HASH=$(get_remote_hash)
    if [ -z "$REMOTE_HASH" ]; then
        log_message "ERROR: Failed to fetch remote commit hash. Check network connection and repository URL."
        exit 1
    fi
    
    log_message "Remote HEAD commit: $REMOTE_HASH"
    
    # Get local commit hash
    LOCAL_HASH=$(get_local_hash)
    log_message "Local HEAD commit: $LOCAL_HASH"
    
    # Compare hashes and take action
    if [ "$LOCAL_HASH" = "no_local_repo" ]; then
        log_message "Local repository not found. Cloning repository..."
        
        # Create parent directory if it doesn't exist
        mkdir -p "$(dirname "$LOCAL_PATH")"
        
        # Clone the repository
        if git clone -b "$BRANCH" "$REPO_URL" "$LOCAL_PATH"; then
            log_message "SUCCESS: Repository cloned successfully to $LOCAL_PATH"
            # Launch application after successful clone
            launch_application
        else
            log_message "ERROR: Failed to clone repository"
            exit 1
        fi
        
    elif [ "$REMOTE_HASH" != "$LOCAL_HASH" ]; then
        log_message "Repository update detected. Pulling latest changes..."
        
        # Stop existing application before updating
        stop_existing_app
        
        cd "$LOCAL_PATH"
        
        # Fetch and pull latest changes
        if git fetch origin "$BRANCH" && git reset --hard "origin/$BRANCH"; then
            log_message "SUCCESS: Repository updated to commit $REMOTE_HASH"
            # Launch application after successful update
            launch_application
        else
            log_message "ERROR: Failed to update repository"
            exit 1
        fi
        
    else
        log_message "Repository is up to date. No action needed."
        # Still launch app if it's not already running
        if [ ! -f "/var/run/monitored-app.pid" ] || ! kill -0 "$(cat /var/run/monitored-app.pid)" 2>/dev/null; then
            log_message "Application not running. Starting application..."
            launch_application
        else
            log_message "Application already running with PID $(cat /var/run/monitored-app.pid)"
        fi
    fi
    
    log_message "Boot repository check completed successfully"
}

# Execute main function
main "$@"