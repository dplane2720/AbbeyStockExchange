"""
Abbey Stock Exchange v5 - Backup Validation Schemas

Marshmallow schemas for backup file validation and operations.
Implements validation for backup creation, restoration, and management.
"""

from marshmallow import Schema, fields, validate, validates, ValidationError, post_load
from datetime import datetime
import re


class BackupSchema(Schema):
    """
    Complete backup file schema for validation and metadata.
    
    Validates backup file structure and ensures data integrity
    according to the YAML backup format specified in PROJECT_MASTER.md.
    """
    
    # Backup metadata
    backup_name = fields.String(
        required=True,
        validate=validate.Regexp(
            r'^\d{4}-\d{2}-\d{2}-backup\.yaml$',
            error="Backup name must follow format: YYYY-MM-DD-backup.yaml"
        )
    )
    
    backup_date = fields.DateTime(
        required=True,
        format='iso'
    )
    
    backup_version = fields.String(
        load_default="5.0.0",
        validate=validate.Regexp(
            r'^\d+\.\d+\.\d+$',
            error="Backup version must follow semantic versioning (X.Y.Z)"
        )
    )
    
    # File metadata
    file_size = fields.Integer(
        dump_only=True,
        validate=validate.Range(
            min=0,
            error="File size cannot be negative"
        )
    )
    
    file_checksum = fields.String(
        dump_only=True,
        validate=validate.Length(
            equal=64,
            error="Checksum must be 64 characters (SHA-256)"
        )
    )
    
    # Backup content structure validation
    settings = fields.Nested('BackupSettingsSchema', required=True)
    drinks = fields.List(
        fields.Nested('BackupDrinkSchema'),
        required=True,
        validate=validate.Length(
            min=0,
            max=50,
            error="Backup can contain 0-50 drinks"
        )
    )
    
    # Additional metadata
    created_by = fields.String(
        load_default="Abbey Stock Exchange v5",
        validate=validate.Length(max=100)
    )
    
    description = fields.String(
        load_default="",
        validate=validate.Length(max=500)
    )
    
    @validates('backup_name')
    def validate_backup_date_format(self, value):
        """
        Validate that the backup name contains a valid date.
        Extracts date from filename and validates it's a real date.
        """
        try:
            date_part = value.split('-backup.yaml')[0]
            datetime.strptime(date_part, '%Y-%m-%d')
        except (ValueError, IndexError):
            raise ValidationError("Backup name contains invalid date format")


class BackupSettingsSchema(Schema):
    """
    Schema for settings section within backup files.
    Validates global system settings stored in backups.
    """
    
    refresh_cycle = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=3600,
            error="Refresh cycle must be between 1 and 3600 seconds"
        )
    )
    
    display_title = fields.String(
        load_default="Abbey Stock Exchange",
        validate=validate.Length(max=100)
    )
    
    currency_symbol = fields.String(
        load_default="$",
        validate=validate.Length(max=5)
    )
    
    sound_enabled = fields.Boolean(load_default=True)
    sound_volume = fields.Integer(
        load_default=70,
        validate=validate.Range(min=0, max=100)
    )
    
    auto_backup_enabled = fields.Boolean(load_default=True)
    backup_retention_days = fields.Integer(
        load_default=30,
        validate=validate.Range(min=1, max=365)
    )
    max_concurrent_users = fields.Integer(
        load_default=10,
        validate=validate.Range(min=1, max=100)
    )
    
    # Display settings
    display_layout = fields.String(
        load_default="single-column",
        validate=validate.OneOf(
            ["single-column", "two-column"],
            error="Display layout must be either 'single-column' or 'two-column'"
        )
    )
    
    font_scale = fields.Integer(
        load_default=100,
        validate=validate.Range(
            min=50,
            max=200,
            error="Font scale must be between 50% and 200%"
        )
    )
    
    # Trend calculation settings
    trend_history_cycles = fields.Integer(
        load_default=1,
        validate=validate.Range(
            min=1,
            max=5,
            error="Trend history cycles must be between 1 and 5"
        )
    )
    
    # UI settings
    double_click_speed = fields.String(
        load_default="normal",
        validate=validate.OneOf(
            ["fast", "normal", "slow"],
            error="Double-click speed must be 'fast', 'normal', or 'slow'"
        )
    )


class BackupDrinkSchema(Schema):
    """
    Schema for individual drinks within backup files.
    Validates drink data structure in backup format.
    """
    
    id = fields.Integer(
        required=True,
        validate=validate.Range(min=1)
    )
    
    name = fields.String(
        required=True,
        validate=validate.Length(min=1, max=50)
    )
    
    minimum_price = fields.Decimal(
        required=True,
        validate=validate.Range(min=0, max=999.99),
        places=2
    )
    
    current_price = fields.Decimal(
        required=True,
        validate=validate.Range(min=0, max=999.99),
        places=2
    )
    
    price_step_size = fields.Decimal(
        required=True,
        validate=validate.Range(min=0.01, max=99.99),
        places=2
    )
    
    list_position = fields.Integer(
        required=True,
        validate=validate.Range(min=1, max=100)
    )
    
    trend = fields.String(
        required=True,
        validate=validate.OneOf(['increasing', 'stable', 'decreasing'])
    )
    
    # Additional tracking fields
    sales_count = fields.Integer(
        load_default=0,
        validate=validate.Range(
            min=0,
            error="Sales count cannot be negative"
        )
    )
    
    # Rolling sales history for trend calculation
    sales_history = fields.List(
        fields.Integer(validate=validate.Range(min=0)),
        load_default=[],
        allow_none=True,
        validate=validate.Length(max=5, error="Sales history cannot exceed 5 cycles")
    )


class BackupCreateSchema(Schema):
    """
    Schema for backup creation requests.
    Validates parameters for creating new backups.
    """
    
    backup_name = fields.String(
        required=False,
        validate=validate.Regexp(
            r'^\d{4}-\d{2}-\d{2}-backup\.yaml$',
            error="Backup name must follow format: YYYY-MM-DD-backup.yaml"
        )
    )
    
    description = fields.String(
        load_default="",
        validate=validate.Length(max=500)
    )
    
    include_settings = fields.Boolean(load_default=True)
    include_drinks = fields.Boolean(load_default=True)
    
    # Backup type
    backup_type = fields.String(
        load_default="manual",
        validate=validate.OneOf(
            ["manual", "automatic", "scheduled"],
            error="Backup type must be 'manual', 'automatic', or 'scheduled'"
        )
    )
    
    @post_load
    def generate_backup_name(self, data, **kwargs):
        """
        Generate backup name if not provided.
        Uses current date in YYYY-MM-DD-backup.yaml format.
        """
        if 'backup_name' not in data or not data['backup_name']:
            current_date = datetime.now().strftime('%Y-%m-%d')
            data['backup_name'] = f"{current_date}-backup.yaml"
        
        return data


class BackupRestoreSchema(Schema):
    """
    Schema for backup restoration operations.
    Validates parameters for restoring from backups.
    """
    
    backup_name = fields.String(
        required=True,
        validate=validate.Regexp(
            r'^\d{4}-\d{2}-\d{2}-backup\.yaml$',
            error="Backup name must follow format: YYYY-MM-DD-backup.yaml"
        )
    )
    
    restore_settings = fields.Boolean(load_default=True)
    restore_drinks = fields.Boolean(load_default=True)
    
    # Safety options
    create_pre_restore_backup = fields.Boolean(load_default=True)
    force_restore = fields.Boolean(load_default=False)
    
    # Restoration scope
    restore_scope = fields.String(
        load_default="full",
        validate=validate.OneOf(
            ["full", "settings_only", "drinks_only"],
            error="Restore scope must be 'full', 'settings_only', or 'drinks_only'"
        )
    )
    
    @validates('backup_name')
    def validate_backup_exists(self, value):
        """
        Note: This validation would be implemented in the service layer
        to check if the backup file actually exists.
        """
        pass


class BackupListSchema(Schema):
    """
    Schema for backup listing operations.
    Validates parameters for retrieving backup lists.
    """
    
    # Filtering options
    start_date = fields.Date(
        required=False,
        format='%Y-%m-%d'
    )
    
    end_date = fields.Date(
        required=False,
        format='%Y-%m-%d'
    )
    
    backup_type = fields.String(
        required=False,
        validate=validate.OneOf(
            ["manual", "automatic", "scheduled", "all"],
            error="Backup type filter must be 'manual', 'automatic', 'scheduled', or 'all'"
        )
    )
    
    # Sorting options
    sort_by = fields.String(
        load_default="date",
        validate=validate.OneOf(
            ["date", "name", "size"],
            error="Sort by must be 'date', 'name', or 'size'"
        )
    )
    
    sort_order = fields.String(
        load_default="desc",
        validate=validate.OneOf(
            ["asc", "desc"],
            error="Sort order must be 'asc' or 'desc'"
        )
    )
    
    # Pagination
    limit = fields.Integer(
        load_default=50,
        validate=validate.Range(
            min=1,
            max=100,
            error="Limit must be between 1 and 100"
        )
    )
    
    offset = fields.Integer(
        load_default=0,
        validate=validate.Range(
            min=0,
            error="Offset cannot be negative"
        )
    )


class BackupMetadataSchema(Schema):
    """
    Schema for backup metadata without full content.
    Used for backup listing and summary operations.
    """
    
    backup_name = fields.String(required=True)
    backup_date = fields.DateTime(required=True, format='iso')
    backup_version = fields.String(required=True)
    file_size = fields.Integer(required=True)
    file_checksum = fields.String(required=True)
    created_by = fields.String(required=True)
    description = fields.String(load_default="")
    
    # Content summary
    settings_count = fields.Integer(dump_only=True)
    drinks_count = fields.Integer(dump_only=True)
    
    # Validation status
    is_valid = fields.Boolean(dump_only=True)
    validation_errors = fields.List(fields.String(), dump_only=True)