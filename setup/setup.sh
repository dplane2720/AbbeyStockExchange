#!/bin/bash

#
# Simplified Setup Script
# 
# Function: Sets up systemd service to run the unified startup script
# 
# Usage: sudo ./setup.sh (run from the setup/ directory)
# 
# Date created: 2025-06-30
# 
# Change Log:
# • 2025-06-30: Simplified setup for unified startup script
#

# Get the parent directory (should be the repo root)
REPO_ROOT="$(cd .. && pwd)"
REPO_NAME="$(basename "$REPO_ROOT")"

echo "Setting up startup service for: $REPO_ROOT"

# Verify the start_app.sh exists in the repo root
if [ ! -f "$REPO_ROOT/start_app.sh" ]; then
    echo "ERROR: start_app.sh not found in $REPO_ROOT"
    echo "Make sure you're running this from the setup/ directory of your repository"
    exit 1
fi

# Make start_app.sh executable
chmod +x "$REPO_ROOT/start_app.sh"

# Copy service file to systemd directory, but first update the paths
SERVICE_FILE="/tmp/abbey-startup.service"
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Abbey Stock Exchange Startup Service
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
User=$USER
Group=$USER
WorkingDirectory=$REPO_ROOT
ExecStart=$REPO_ROOT/start_app.sh
StandardOutput=journal
StandardError=journal
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

# Install the service
sudo cp "$SERVICE_FILE" /etc/systemd/system/abbey-startup.service
rm "$SERVICE_FILE"

# Create log file with proper permissions
sudo touch /var/log/git-repo-monitor.log
sudo chown $USER:$USER /var/log/git-repo-monitor.log

# Create PID directory
sudo mkdir -p /var/run
sudo chown $USER:$USER /var/run 2>/dev/null || true

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable abbey-startup.service

echo "========================================="
echo "SETUP COMPLETED SUCCESSFULLY!"
echo "========================================="
echo "Service: abbey-startup.service"
echo "Script: $REPO_ROOT/start_app.sh"
echo "Log file: /var/log/git-repo-monitor.log"
echo ""
echo "The unified script will:"
echo "  1. Check for repository updates at startup"
echo "  2. Start your Flask app (if not already running)"
echo "  3. Launch browser in kiosk mode (if not already open)"
echo ""
echo "Commands:"
echo "  Manual run: sudo systemctl start abbey-startup.service"
echo "  Check status: systemctl status abbey-startup.service"
echo "  View logs: journalctl -u abbey-startup.service"
echo "  Tail log file: tail -f /var/log/git-repo-monitor.log"
echo "========================================="