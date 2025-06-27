"""
Abbey Stock Exchange v5 - Settings Validation Schemas

Marshmallow schemas for application settings validation and configuration.
Implements validation for refresh cycle rates and system preferences.
"""

from marshmallow import Schema, fields, validate, validates, ValidationError, post_load
from decimal import Decimal


class SettingsSchema(Schema):
    """
    Complete application settings schema.
    
    Validates all system-wide configuration options including:
    - Refresh cycle timing
    - Display preferences
    - System behavior settings
    """
    
    refresh_cycle = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,       # 1 second minimum 
            max=3600,    # 1 hour maximum
            error="Refresh cycle must be between 1 second and 3600 seconds (1 hour)"
        )
    )
    
    # Display settings
    display_title = fields.String(
        load_default="Abbey Stock Exchange",
        validate=validate.Length(
            max=100,
            error="Display title must be 100 characters or less"
        )
    )
    
    # Audio settings
    sound_enabled = fields.Boolean(load_default=True)
    sound_volume = fields.Integer(
        load_default=70,
        validate=validate.Range(
            min=0,
            max=100,
            error="Sound volume must be between 0 and 100"
        )
    )
    
    # Price display settings
    currency_symbol = fields.String(
        load_default="$",
        validate=validate.Length(
            max=5,
            error="Currency symbol must be 5 characters or less"
        )
    )
    
    # System behavior
    auto_backup_enabled = fields.Boolean(load_default=True)
    backup_retention_days = fields.Integer(
        load_default=30,
        validate=validate.Range(
            min=1,
            max=365,
            error="Backup retention must be between 1 and 365 days"
        )
    )
    
    # Performance settings
    max_concurrent_users = fields.Integer(
        load_default=10,
        validate=validate.Range(
            min=1,
            max=100,
            error="Max concurrent users must be between 1 and 100"
        )
    )
    
    # Last updated timestamp
    last_updated = fields.DateTime(dump_only=True)
    
    @validates('refresh_cycle')
    def validate_refresh_cycle_increments(self, value):
        """
        Validate that refresh cycle is in reasonable increments.
        Should be divisible by 30 seconds for better user experience.
        """
        if value % 30 != 0:
            raise ValidationError(
                "Refresh cycle should be in 30-second increments for optimal performance"
            )
    
    @validates('display_title')
    def validate_display_title_content(self, value):
        """Ensure display title doesn't contain harmful content."""
        if value and ('<script>' in value.lower() or 'javascript:' in value.lower()):
            raise ValidationError("Display title contains invalid content")


class RefreshCycleSchema(Schema):
    """
    Simplified schema for refresh cycle updates.
    Used for quick configuration changes.
    """
    
    refresh_cycle = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=3600,
            error="Refresh cycle must be between 1 second and 3600 seconds (1 hour)"
        )
    )
    
    @validates('refresh_cycle')
    def validate_refresh_cycle_increments(self, value):
        """Validate refresh cycle increments."""
        if value % 30 != 0:
            raise ValidationError(
                "Refresh cycle should be in 30-second increments"
            )
    
    @post_load
    def format_output(self, data, **kwargs):
        """Format the output with additional metadata."""
        return {
            'refresh_cycle': data['refresh_cycle'],
            'refresh_cycle_minutes': round(data['refresh_cycle'] / 60, 1),
            'refresh_cycle_display': self._format_time_display(data['refresh_cycle'])
        }
    
    def _format_time_display(self, seconds):
        """Format seconds into human-readable time display."""
        if seconds < 60:
            return f"{seconds}s"
        elif seconds < 3600:
            minutes = seconds // 60
            remaining_seconds = seconds % 60
            if remaining_seconds == 0:
                return f"{minutes}m"
            else:
                return f"{minutes}m {remaining_seconds}s"
        else:
            hours = seconds // 3600
            remaining_minutes = (seconds % 3600) // 60
            if remaining_minutes == 0:
                return f"{hours}h"
            else:
                return f"{hours}h {remaining_minutes}m"


class DisplaySettingsSchema(Schema):
    """
    Schema for display-specific settings.
    Used for customer display configuration.
    """
    
    display_title = fields.String(
        required=True,
        validate=validate.Length(
            min=1,
            max=100,
            error="Display title must be 1-100 characters"
        )
    )
    
    currency_symbol = fields.String(
        required=True,
        validate=validate.Length(
            min=1,
            max=5,
            error="Currency symbol must be 1-5 characters"
        )
    )
    
    show_trend_arrows = fields.Boolean(load_default=True)
    show_countdown_timer = fields.Boolean(load_default=True)
    
    # Font size scaling (percentage)
    font_scale = fields.Integer(
        load_default=100,
        validate=validate.Range(
            min=50,
            max=200,
            error="Font scale must be between 50% and 200%"
        )
    )


class AudioSettingsSchema(Schema):
    """
    Schema for audio system settings.
    Used for sound configuration.
    """
    
    sound_enabled = fields.Boolean(required=True)
    
    sound_volume = fields.Integer(
        required=True,
        validate=validate.Range(
            min=0,
            max=100,
            error="Sound volume must be between 0 and 100"
        )
    )
    
    # Sound file selection
    sound_file = fields.String(
        load_default="bell.wav",
        validate=validate.OneOf(
            ["bell.wav", "chime.wav", "ding.wav", "none"],
            error="Invalid sound file selection"
        )
    )
    
    # Play sound on events
    play_on_price_change = fields.Boolean(load_default=True)
    play_on_refresh_cycle = fields.Boolean(load_default=True)
    play_on_admin_action = fields.Boolean(load_default=False)


class SystemSettingsSchema(Schema):
    """
    Schema for system-level settings.
    Used for administrative configuration.
    """
    
    auto_backup_enabled = fields.Boolean(required=True)
    
    backup_retention_days = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=365,
            error="Backup retention must be between 1 and 365 days"
        )
    )
    
    max_concurrent_users = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=100,
            error="Max concurrent users must be between 1 and 100"
        )
    )
    
    # Performance monitoring
    enable_performance_logging = fields.Boolean(load_default=False)
    log_level = fields.String(
        load_default="INFO",
        validate=validate.OneOf(
            ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
            error="Invalid log level"
        )
    )
    
    # Security settings
    require_admin_confirmation = fields.Boolean(load_default=True)
    session_timeout_minutes = fields.Integer(
        load_default=60,
        validate=validate.Range(
            min=5,
            max=480,
            error="Session timeout must be between 5 minutes and 8 hours"
        )
    )