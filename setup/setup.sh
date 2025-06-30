#!/bin/bash

#
# Git Repository Boot Monitor Setup Script
# 
# Function: Installs and configures the git repository boot check service
# 
# Usage: sudo ./setup-git-monitor.sh
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Initial setup script for systemd service installation
# • 2025-06-30: Simplified for boot-only execution on Raspberry Pi
#

# Copy script to system location
sudo cp git-repo-monitor.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/git-repo-monitor.sh

# Copy systemd service file 
sudo cp git-repo-monitor.service /etc/systemd/system/

# Create log files with proper permissions
sudo touch /var/log/git-repo-monitor.log
sudo touch /var/log/app-output.log
sudo chown $USER:$USER /var/log/git-repo-monitor.log
sudo chown $USER:$USER /var/log/app-output.log

# Create PID file directory if it doesn't exist
sudo mkdir -p /var/run
sudo chown $USER:$USER /var/run/monitored-app.pid 2>/dev/null || true

# Reload systemd daemon
sudo systemctl daemon-reload

echo "Git repository boot monitor with app launcher installed successfully!"
echo "Service will run once at each boot and launch your application."
echo "To manually run: sudo systemctl start git-repo-monitor.service"
echo "To check status: systemctl status git-repo-monitor.service"
echo "To view logs: journalctl -u git-repo-monitor.service"

# Enable the service to run at boot (no timer needed)
sudo systemctl enable git-repo-monitor.service
