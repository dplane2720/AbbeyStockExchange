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
#

# Copy script to system location
sudo cp git-repo-monitor.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/git-repo-monitor.sh

# Copy systemd service file only (no timer needed)
sudo cp git-repo-monitor.service /etc/systemd/system/

# Create log file with proper permissions
sudo touch /var/log/git-repo-monitor.log
sudo chown $USER:$USER /var/log/git-repo-monitor.log

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable the service to run at boot (no timer needed)
sudo systemctl enable git-repo-monitor.service

echo "Git repository boot monitor service installed successfully!"
echo "Service will run once at each boot."
echo "To manually run: sudo systemctl start git-repo-monitor.service"
echo "To check status: systemctl status git-repo-monitor.service"
echo "To view logs: journalctl -u git-repo-monitor.service"
echo "To check log file: tail -f /var/log/git-repo-monitor.log"