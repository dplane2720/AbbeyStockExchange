"""
Abbey Stock Exchange v5 - Configuration Settings

This module contains all configuration settings for the application,
organized by environment (development, production, testing).
"""

import os
from pathlib import Path


class Config:
    """Base configuration class with common settings."""
    
    # Application settings
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    
    # Project paths
    BASE_DIR = Path(__file__).parent.parent
    DATA_DIR = BASE_DIR / 'data'
    BACKUP_DIR = DATA_DIR / 'backups'
    SCHEMAS_DIR = DATA_DIR / 'schemas'
    LOGS_DIR = DATA_DIR / 'logs'
    
    # Ensure directories exist
    DATA_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)
    SCHEMAS_DIR.mkdir(exist_ok=True)
    LOGS_DIR.mkdir(exist_ok=True)
    
    # Flask-SocketIO settings
    SOCKETIO_ASYNC_MODE = 'threading'  # Changed from eventlet due to compatibility issues
    SOCKETIO_CORS_ALLOWED_ORIGINS = "*"
    
    # Price engine settings
    DEFAULT_REFRESH_CYCLE = 30   # 30 seconds for testing
    MIN_REFRESH_CYCLE = 1        # 1 second minimum
    MAX_REFRESH_CYCLE = 3600     # 1 hour maximum
    
    # Trend calculation settings
    DEFAULT_TREND_HISTORY_CYCLES = 1  # 1 = immediate trends (current behavior), 2+ = rolling trends
    MIN_TREND_HISTORY_CYCLES = 1      # Minimum 1 cycle
    MAX_TREND_HISTORY_CYCLES = 5      # Maximum 5 cycles
    
    # Data validation settings
    MAX_DRINK_NAME_LENGTH = 50
    MIN_PRICE = 0.0
    MAX_PRICE = 999.99
    DEFAULT_PRICE_STEP = 0.50
    
    # Backup settings
    BACKUP_RETENTION_DAYS = 30
    AUTO_BACKUP_ENABLED = True
    
    # WebSocket settings
    WEBSOCKET_HEARTBEAT_INTERVAL = 25
    WEBSOCKET_HEARTBEAT_TIMEOUT = 60


class DevelopmentConfig(Config):
    """Development environment configuration."""
    
    DEBUG = True
    TESTING = False
    
    # Development-specific settings
    FLASK_ENV = 'development'
    LOG_LEVEL = 'DEBUG'
    
    # Shorter refresh cycle for development
    DEFAULT_REFRESH_CYCLE = 30  # 30 seconds for testing


class ProductionConfig(Config):
    """Production environment configuration."""
    
    DEBUG = False
    TESTING = False
    
    # Production-specific settings
    FLASK_ENV = 'production'
    LOG_LEVEL = 'INFO'
    
    # Security settings
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


class TestingConfig(Config):
    """Testing environment configuration."""
    
    DEBUG = True
    TESTING = True
    
    # Testing-specific settings
    FLASK_ENV = 'testing'
    LOG_LEVEL = 'DEBUG'
    
    # Very short refresh cycle for testing
    DEFAULT_REFRESH_CYCLE = 10  # 10 seconds
    
    # Use separate test directories
    DATA_DIR = Config.BASE_DIR / 'test_data'
    BACKUP_DIR = DATA_DIR / 'backups'
    SCHEMAS_DIR = DATA_DIR / 'schemas'
    LOGS_DIR = DATA_DIR / 'logs'


# Configuration dictionary for easy selection
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(config_name=None):
    """
    Get configuration class based on environment.
    
    Args:
        config_name (str): Configuration name ('development', 'production', 'testing')
                          If None, uses FLASK_ENV environment variable
    
    Returns:
        Config: Configuration class instance
    """
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config[config_name]