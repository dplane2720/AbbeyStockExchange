"""
Abbey Stock Exchange v5 - Main Flask Application

This is the main application file that sets up the Flask app with all
blueprints, extensions, and configuration. It implements a modular
architecture with RESTful API endpoints and WebSocket support.
"""

import os
import logging
import logging.config
from pathlib import Path
from decimal import Decimal
from datetime import datetime
import json

from flask import Flask, render_template, jsonify
from flask_restful import Api, Resource
from flask_socketio import SocketIO
from werkzeug.exceptions import HTTPException

from config.settings import get_config
from api.routes import drinks, settings, backups
from core.websocket_manager import WebSocketManager
from core.price_engine import PriceEngine
from core.data_manager import DataManager
from core.backup_manager import BackupManager


class DecimalJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles Decimal objects."""
    
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


class HealthCheck(Resource):
    """API endpoint for application health checks."""
    
    def get(self):
        """
        Comprehensive health check endpoint.
        
        Returns:
            JSON: Application health status
        """
        try:
            from flask import current_app
            
            # Check core components
            data_manager_healthy = current_app.data_manager.is_healthy()
            
            # Check if price engine is running
            try:
                price_engine_running = current_app.price_engine.is_running()
            except:
                price_engine_running = False
            
            # Get system metrics
            metadata = current_app.data_manager.get_metadata()
            drinks_count = len(current_app.data_manager.get_drinks())
            
            health_data = {
                'status': 'healthy' if data_manager_healthy else 'unhealthy',
                'version': metadata.get('version', '5.0.0'),
                'timestamp': metadata.get('last_updated'),
                'components': {
                    'data_manager': data_manager_healthy,
                    'price_engine': price_engine_running,
                    'websocket_manager': True  # Assume healthy if no errors
                },
                'metrics': {
                    'drinks_count': drinks_count,
                    'config_env': current_app.config.get('FLASK_ENV', 'development')
                }
            }
            
            overall_healthy = all([
                data_manager_healthy,
                price_engine_running
            ])
            
            status_code = 200 if overall_healthy else 503
            
            return {
                'success': True,
                'data': health_data,
                'message': 'System operational' if overall_healthy else 'System issues detected'
            }, status_code
            
        except Exception as e:
            return {
                'success': False,
                'error': 'Health check failed',
                'message': str(e)
            }, 500


def create_app(config_name=None):
    """
    Application factory function that creates and configures the Flask app.
    
    Args:
        config_name (str): Configuration environment name
        
    Returns:
        tuple: (Flask app instance, SocketIO instance)
    """
    app = Flask(__name__)
    
    # Configure JSON encoder to handle Decimal and datetime objects
    def json_serializer(obj):
        if isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
    
    app.json.default = json_serializer
    
    # Load configuration
    config_class = get_config(config_name)
    app.config.from_object(config_class)
    
    # Setup logging
    setup_logging(app)
    
    # Initialize extensions
    api = Api(app)
    socketio = SocketIO(
        app, 
        async_mode=app.config['SOCKETIO_ASYNC_MODE'],
        cors_allowed_origins=app.config['SOCKETIO_CORS_ALLOWED_ORIGINS']
    )
    
    # Initialize core components
    data_manager = DataManager(app.config)
    
    # Load from backup file on startup (source of truth)
    try:
        app.logger.info("Attempting to load data from backup file...")
        if data_manager.load_from_backup():
            drinks_count = len(data_manager.get_drinks())
            settings = data_manager.get_settings()
            app.logger.info(f"Successfully loaded data from backup file: {drinks_count} drinks, refresh_cycle={settings.get('refresh_cycle', 'NOT SET')}")
        else:
            app.logger.warning("Failed to load from backup, using defaults")
            drinks_count = len(data_manager.get_drinks())
            app.logger.info(f"Current drinks count after backup failure: {drinks_count}")
    except Exception as e:
        app.logger.error(f"Error loading backup on startup: {e}")
        drinks_count = len(data_manager.get_drinks())
        app.logger.info(f"Current drinks count after exception: {drinks_count}")
    
    websocket_manager = WebSocketManager(socketio)
    price_engine = PriceEngine(data_manager, websocket_manager, app.config)
    backup_manager = BackupManager(data_manager, app.config)
    
    # Store components in app context for access from routes
    app.data_manager = data_manager
    app.websocket_manager = websocket_manager
    app.price_engine = price_engine
    app.backup_manager = backup_manager
    
    # Register API routes
    register_api_routes(api)
    
    # Register web routes
    register_web_routes(app)
    
    # Register WebSocket events
    websocket_manager.register_events()
    
    # Register error handlers
    register_error_handlers(app)
    
    # Initialize data on startup
    initialize_app_data(app)
    
    return app, socketio


def setup_logging(app):
    """
    Configure logging for the application.
    
    Args:
        app: Flask application instance
    """
    log_config_path = Path(app.config['BASE_DIR']) / 'config' / 'logging.conf'
    
    if log_config_path.exists():
        logging.config.fileConfig(log_config_path)
    else:
        # Fallback to basic logging if config file doesn't exist
        logging.basicConfig(
            level=logging.DEBUG if app.debug else logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    
    app.logger.info(f"Abbey Stock Exchange v5 starting in {app.config['FLASK_ENV']} mode")


def register_api_routes(api):
    """
    Register all API endpoints with the Flask-RESTful API instance.
    
    Args:
        api: Flask-RESTful API instance
    """
    # Drinks API endpoints
    api.add_resource(drinks.DrinkList, '/api/drinks')
    api.add_resource(drinks.DrinkDetail, '/api/drinks/<int:drink_id>')
    api.add_resource(drinks.DrinkSales, '/api/drinks/<int:drink_id>/sales')
    api.add_resource(drinks.DrinkReorder, '/api/drinks/reorder')
    api.add_resource(drinks.DrinkSalesReset, '/api/drinks/reset-sales')
    
    # Settings API endpoints
    api.add_resource(settings.AppSettings, '/api/settings')
    api.add_resource(settings.RefreshCycle, '/api/settings/refresh-cycle')
    api.add_resource(settings.SystemStatus, '/api/settings/status')
    api.add_resource(settings.PriceEngineControl, '/api/settings/price-engine')
    
    # Backup API endpoints
    api.add_resource(backups.BackupList, '/api/backups')
    api.add_resource(backups.BackupDetail, '/api/backups/<string:backup_name>')
    api.add_resource(backups.BackupRestore, '/api/backups/<string:backup_name>/restore')
    api.add_resource(backups.BackupValidate, '/api/backups/<string:backup_name>/validate')
    
    # Health check endpoint
    api.add_resource(HealthCheck, '/api/health')


def register_web_routes(app):
    """
    Register web page routes for the customer display and admin interface.
    
    Args:
        app: Flask application instance
    """
    
    @app.route('/')
    def index():
        """Redirect to customer display by default."""
        return render_template('customer_display.html')
    
    @app.route('/display')
    def customer_display():
        """Customer display page - TV-optimized 16:9 interface."""
        return render_template('customer_display.html')
    
    @app.route('/admin')
    def admin_page():
        """Admin interface page - touch-optimized for all devices."""
        return render_template('admin_page.html')


def register_error_handlers(app):
    """
    Register error handlers for the application.
    
    Args:
        app: Flask application instance
    """
    
    # Add CORS headers to all responses
    @app.after_request
    def add_cors_headers(response):
        """Add CORS headers to all responses."""
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        """Handle HTTP exceptions with JSON responses."""
        return jsonify({
            'error': error.name,
            'message': error.description,
            'status_code': error.code
        }), error.code
    
    @app.errorhandler(Exception)
    def handle_general_exception(error):
        """Handle unexpected exceptions."""
        app.logger.error(f"Unexpected error: {error}")
        return jsonify({
            'error': 'Internal Server Error',
            'message': 'An unexpected error occurred.',
            'status_code': 500
        }), 500


def initialize_app_data(app):
    """
    Initialize application data on startup.
    
    Args:
        app: Flask application instance
    """
    try:
        # Load data from most recent backup
        app.data_manager.load_from_backup()
        app.logger.info("Application data loaded successfully")
        
        # Start the price engine
        app.price_engine.start()
        app.logger.info("Price engine started successfully")
        
        # Start the backup manager scheduler
        app.backup_manager.start_scheduler()
        app.logger.info("Backup manager started successfully")
        
    except Exception as e:
        app.logger.error(f"Failed to initialize application data: {e}")
        # Don't prevent startup, but log the error
        app.logger.info("Continuing with default data")


class HealthCheck(Resource):
    """Health check endpoint for monitoring application status."""
    
    def get(self):
        """
        Return application health status.
        
        Returns:
            dict: Health status information
        """
        from flask import current_app
        
        try:
            # Check if price engine is running
            price_engine_status = current_app.price_engine.is_running()
            
            # Check data manager status
            data_manager_status = current_app.data_manager.is_healthy()
            
            # Check WebSocket manager status
            websocket_status = len(current_app.websocket_manager.get_connected_clients()) >= 0
            
            overall_status = all([price_engine_status, data_manager_status, websocket_status])
            
            return {
                'status': 'healthy' if overall_status else 'unhealthy',
                'components': {
                    'price_engine': 'running' if price_engine_status else 'stopped',
                    'data_manager': 'healthy' if data_manager_status else 'error',
                    'websocket': 'connected' if websocket_status else 'disconnected'
                },
                'timestamp': current_app.data_manager.get_current_timestamp()
            }
            
        except Exception as e:
            current_app.logger.error(f"Health check failed: {e}")
            return {
                'status': 'error',
                'message': str(e),
                'timestamp': current_app.data_manager.get_current_timestamp()
            }, 500


if __name__ == '__main__':
    """
    Run the application in development mode.
    For production, use a WSGI server like Gunicorn.
    """
    app, socketio = create_app()
    
    # Run with SocketIO support
    socketio.run(
        app,
        debug=app.debug,
        host='0.0.0.0',
        port=5001,
        use_reloader=app.debug,
        allow_unsafe_werkzeug=True  # Allow development server
    )