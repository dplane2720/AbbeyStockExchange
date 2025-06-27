# AbbeyStockExchange

## Overview
A modern, touch-optimized web application that simulates a stock market for bar drinks with dynamic pricing based on sales demand. Features real-time price updates, professional admin tools, and Raspberry Pi compatibility for production bar environments.

NOTE: current version is still in development.
Coming with next update:
- [] Install script to set up for Kiosk mode (for Respberry Pi)
- [] Auto launching browser windows
- [] Stock bell sound effects
- [] More UI tweaks and improvements!

## 🚀 Quick Start

### Running the Application
- Clone the repo
- `cd AbbeyStockExchange`
- `python -m venv venv`
- On Mac / Linux: `source venv/bin/activate`
- On Windows: `venv\Scripts\activate`

### Access Points
- **Customer Display:** http://localhost:5001/display
- **Admin Interface:** http://localhost:5001/admin  
- **API Health Check:** http://localhost:5001/api/health

## Key Features

- Real-time price updates via WebSocket
- Touch-optimized admin interface
- Automatic data backups
- RESTful API endpoints
- Raspberry Pi optimized performance

## Stopping the Application

Press `Ctrl+C` in the terminal to stop the development server.

## 🔧 Architecture
- **Backend:** Flask RESTful API with WebSocket support
- **Frontend:** Modern Vanilla JavaScript with modular architecture
- **Data:** YAML storage with comprehensive backup system
- **Real-time:** WebSocket-based price updates and synchronization
- **Deployment:** Raspberry Pi optimized with production configuration

## 📋 Recent Bug Fixes (June 23, 2025)
1. ✅ Customer Display Timer Reset - Fixed countdown clock reset functionality
2. ✅ Admin Page Refresh Cycle - Fixed price engine loop for trend updates  
3. ✅ App Settings Save Button - Verified save functionality with backend integration
4. ✅ Default Refresh Cycle - Optimized from 300s to 30s for testing
5. ✅ Backup Modal Data - Fixed backup file list retrieval and display
6. ✅ Last Backup Display - Fixed timestamp showing correctly
7. ✅ Modal Responsiveness - Fixed cancel button blur/unresponsive issues

## Troubleshooting

- Check `data/logs/abbey.log` for application logs
- Verify all dependencies are installed: `pip list`
- Ensure port 5001 is available

<hr>
Built with the Claude Code - 100xProgramming Workflow (https://github.com/dplane2720)
