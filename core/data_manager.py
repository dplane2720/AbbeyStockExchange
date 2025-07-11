"""
Abbey Stock Exchange v5 - Enhanced Data Manager

This module handles all data operations including YAML file management,
backup operations, data validation, atomic operations, and rollback capabilities.
"""

import logging
import yaml
import fcntl
import hashlib
import json
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from collections import OrderedDict
from contextlib import contextmanager
from decimal import Decimal

from api.validators.drink_schema import DrinkSchema
from api.validators.settings_schema import SettingsSchema
from api.validators.backup_schema import BackupSchema
from api.validators.custom_validators import BusinessRuleValidator

logger = logging.getLogger('abbey.data_manager')


class DataManagerError(Exception):
    """Base exception for data manager operations."""
    pass


class BackupCorruptedError(DataManagerError):
    """Raised when a backup file is corrupted or invalid."""
    pass


class DataValidationError(DataManagerError):
    """Raised when data fails validation."""
    pass


class FileOperationError(DataManagerError):
    """Raised when file operations fail."""
    pass


class OrderedDictYAMLLoader(yaml.SafeLoader):
    """Custom YAML loader that preserves order using OrderedDict."""
    pass


class OrderedDictYAMLDumper(yaml.SafeDumper):
    """Custom YAML dumper that handles OrderedDict."""
    pass


# Configure YAML to handle OrderedDict for drink ordering
def construct_mapping(loader, node):
    return OrderedDict(loader.construct_pairs(node))


def represent_ordereddict(dumper, data):
    return dumper.represent_mapping('tag:yaml.org,2002:map', data.items())


def represent_decimal(dumper, data):
    return dumper.represent_scalar('!decimal', str(data))


def construct_decimal(loader, node):
    value = loader.construct_scalar(node)
    return Decimal(value)


OrderedDictYAMLLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, construct_mapping)
OrderedDictYAMLLoader.add_constructor('!decimal', construct_decimal)
OrderedDictYAMLDumper.add_representer(OrderedDict, represent_ordereddict)
OrderedDictYAMLDumper.add_representer(Decimal, represent_decimal)


class DataManager:
    """
    Enhanced data manager for the Abbey Stock Exchange.
    
    Provides atomic YAML operations, backup management, data validation,
    integrity checking, and rollback capabilities.
    """
    
    def __init__(self, config):
        """
        Initialize the enhanced data manager.
        
        Args:
            config: Application configuration dictionary
        """
        self.config = config
        self.backup_dir = Path(config['BACKUP_DIR'])
        self.schemas_dir = Path(config['SCHEMAS_DIR'])
        self.logs_dir = Path(config['LOGS_DIR'])
        
        # Initialize schemas
        self.drink_schema = DrinkSchema(many=True)
        self.settings_schema = SettingsSchema()
        self.backup_schema = BackupSchema()
        
        # Current data with validation
        self.current_data = {
            'metadata': {
                'version': '5.0.0',
                'last_updated': self.get_current_timestamp(),
                'checksum': None
            },
            'settings': {
                'refresh_cycle': config['DEFAULT_REFRESH_CYCLE'],
                'display_title': 'Abbey Stock Exchange',
                'currency_symbol': '$',
                'sound_enabled': True,
                'auto_backup_enabled': True,
                'trend_history_cycles': config.get('DEFAULT_TREND_HISTORY_CYCLES', 1),
                'double_click_speed': 'normal'
            },
            'drinks': []
        }
        
        # File locks for atomic operations
        self._locks = {}
        
        # Ensure directories exist
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.schemas_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize default schema files
        self._create_default_schemas()
        
        logger.info("Enhanced Data Manager initialized")
    
    @contextmanager
    def _file_lock(self, file_path: Path):
        """
        Context manager for file locking to ensure atomic operations.
        
        Args:
            file_path: Path to file to lock
            
        Yields:
            file handle with exclusive lock
        """
        lock_file = file_path.with_suffix(f'{file_path.suffix}.lock')
        
        try:
            # Create lock file
            with open(lock_file, 'w') as lock_handle:
                # Acquire exclusive lock
                fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
                logger.debug(f"Acquired lock for {file_path}")
                yield lock_handle
                
        except Exception as e:
            logger.error(f"Failed to acquire lock for {file_path}: {e}")
            raise FileOperationError(f"Could not lock file {file_path}: {e}")
        finally:
            # Remove lock file
            try:
                lock_file.unlink(missing_ok=True)
                logger.debug(f"Released lock for {file_path}")
            except Exception as e:
                logger.warning(f"Failed to remove lock file {lock_file}: {e}")
    
    def _calculate_checksum(self, data: Dict[str, Any]) -> str:
        """
        Calculate SHA-256 checksum of data for integrity verification.
        
        Args:
            data: Data dictionary to checksum
            
        Returns:
            str: Hexadecimal checksum string
        """
        # Create canonical JSON representation for consistent checksums
        # Handle Decimal objects by converting to string
        def decimal_serializer(obj):
            if isinstance(obj, Decimal):
                return str(obj)
            raise TypeError(f"Object of type {obj.__class__.__name__} is not JSON serializable")
        
        json_str = json.dumps(data, sort_keys=True, separators=(',', ':'), default=decimal_serializer)
        return hashlib.sha256(json_str.encode('utf-8')).hexdigest()
    
    def _validate_data_integrity(self, data: Dict[str, Any]) -> bool:
        """
        Validate data integrity using checksum verification.
        
        Args:
            data: Data dictionary to validate
            
        Returns:
            bool: True if integrity is valid
        """
        if 'metadata' not in data or 'checksum' not in data['metadata']:
            logger.warning("Data missing integrity metadata")
            return False
        
        stored_checksum = data['metadata']['checksum']
        if not stored_checksum:
            return True  # No checksum to verify
        
        # Calculate checksum excluding the checksum field itself
        data_copy = data.copy()
        data_copy['metadata'] = data_copy['metadata'].copy()
        data_copy['metadata']['checksum'] = None
        
        calculated_checksum = self._calculate_checksum(data_copy)
        is_valid = calculated_checksum == stored_checksum
        
        if not is_valid:
            logger.error(f"Data integrity check failed: {calculated_checksum} != {stored_checksum}")
        
        return is_valid
    
    def _update_metadata(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Update metadata fields including checksum and timestamp.
        
        Args:
            data: Data dictionary to update
            
        Returns:
            Dict: Updated data with new metadata
        """
        if 'metadata' not in data:
            data['metadata'] = {}
        
        data['metadata'].update({
            'version': '5.0.0',
            'last_updated': self.get_current_timestamp(),
            'checksum': None  # Calculate after setting other metadata
        })
        
        # Calculate and set checksum
        data['metadata']['checksum'] = self._calculate_checksum(data)
        
        return data
    
    def _validate_business_rules(self, data: Dict[str, Any]) -> List[str]:
        """
        Validate business rules using custom validators.
        
        Args:
            data: Data dictionary to validate
            
        Returns:
            List[str]: List of validation error messages
        """
        errors = []
        
        # Validate drinks data
        drinks = data.get('drinks', [])
        if drinks:
            # Schema validation
            try:
                self.drink_schema.load(drinks)
            except Exception as e:
                errors.append(f"Drink schema validation failed: {e}")
            
            # Business rule validation
            drink_errors = BusinessRuleValidator.validate_price_algorithm_constraints(drinks)
            errors.extend(drink_errors)
            
            # Unique names validation
            name_errors = BusinessRuleValidator.validate_drink_name_uniqueness(drinks)
            errors.extend(name_errors)
        
        # Validate settings
        settings = data.get('settings', {})
        if settings:
            try:
                self.settings_schema.load(settings)
            except Exception as e:
                errors.append(f"Settings schema validation failed: {e}")
            
            # Refresh cycle compatibility
            refresh_cycle = settings.get('refresh_cycle')
            if refresh_cycle:
                cycle_errors = BusinessRuleValidator.validate_refresh_cycle_compatibility(
                    refresh_cycle, len(drinks)
                )
                errors.extend(cycle_errors)
        
        # System-wide validation
        system_errors = BusinessRuleValidator.validate_system_limits(data)
        errors.extend(system_errors)
        
        return errors
    
    def _create_default_schemas(self):
        """Create default schema files for validation reference."""
        schema_files = {
            'drink_schema.json': {
                'type': 'object',
                'required': ['id', 'name', 'minimum_price', 'current_price', 'price_step_size', 'list_position', 'trend'],
                'properties': {
                    'id': {'type': 'integer', 'minimum': 1},
                    'name': {'type': 'string', 'minLength': 1, 'maxLength': 50},
                    'minimum_price': {'type': 'number', 'minimum': 0, 'maximum': 999.99},
                    'current_price': {'type': 'number', 'minimum': 0, 'maximum': 999.99},
                    'price_step_size': {'type': 'number', 'minimum': 0.01, 'maximum': 99.99},
                    'list_position': {'type': 'integer', 'minimum': 1, 'maximum': 100},
                    'trend': {'type': 'string', 'enum': ['increasing', 'stable', 'decreasing']}
                }
            }
        }
        
        for filename, schema in schema_files.items():
            schema_file = self.schemas_dir / filename
            if not schema_file.exists():
                with open(schema_file, 'w') as f:
                    json.dump(schema, f, indent=2)
    
    def _is_v4_backup_format(self, data: Dict[str, Any]) -> bool:
        """
        Check if backup data is in v4 format (flat structure with drink names as keys).
        
        Args:
            data: Loaded backup data
            
        Returns:
            bool: True if v4 format detected
        """
        # v4 format characteristics:
        # - No 'backup_version' field
        # - No 'drinks' array 
        # - Drink names as top-level keys with price data
        if 'backup_version' in data or 'drinks' in data:
            return False
        
        # Check if we have drink-like entries (non-metadata keys)
        drink_keys = [k for k in data.keys() if k not in ['settings', 'metadata']]
        if not drink_keys:
            return False
        
        # Check if first drink entry has v4 structure
        first_drink = data.get(drink_keys[0], {})
        v4_fields = ['initial_price', 'min_price', 'max_price', 'position']
        return any(field in first_drink for field in v4_fields)
    
    def _migrate_v4_to_v5(self, v4_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Migrate v4 backup format to v5 application data format.
        
        Args:
            v4_data: v4 format backup data
            
        Returns:
            Dict: v5 format application data
        """
        drinks = []
        drink_id = 1
        
        # Convert v4 drinks to v5 format
        for drink_name, drink_data in v4_data.items():
            if drink_name in ['settings', 'metadata']:
                continue
                
            # Extract v4 fields
            initial_price = float(drink_data.get('initial_price', 5.0))
            min_price = float(drink_data.get('min_price', initial_price))
            max_price = float(drink_data.get('max_price', initial_price * 2))
            position = int(drink_data.get('position', drink_id))
            
            # Create v5 drink entry
            v5_drink = {
                'id': drink_id,
                'name': drink_name,
                'minimum_price': min_price,
                'current_price': initial_price,
                'price_step_size': 0.50,  # Default step size
                'list_position': position,
                'trend': 'stable',
                'sales_count': 0,
                'last_sale': None
            }
            
            drinks.append(v5_drink)
            drink_id += 1
        
        # Sort drinks by position
        drinks.sort(key=lambda x: x['list_position'])
        
        # Create v5 application data structure
        new_data = {
            'metadata': {
                'version': '5.0.0',
                'last_updated': self.get_current_timestamp(),
                'migrated_from': 'v4_backup'
            },
            'settings': v4_data.get('settings', {
                'refresh_cycle': 300,
                'display_title': 'Abbey Stock Exchange',
                'currency_symbol': '$',
                'sound_enabled': True,
                'auto_backup_enabled': True
            }),
            'drinks': drinks
        }
        
        return new_data
    
    def _create_default_drinks_data(self):
        """
        Create default drinks data when no backup is available.
        """
        default_drinks = [
            {
                'id': 1,
                'name': 'Beer',
                'minimum_price': 4.00,
                'current_price': 5.50,
                'price_step_size': 0.50,
                'list_position': 1,
                'trend': 'stable',
                'sales_count': 0,
                'last_sale': None
            },
            {
                'id': 2,
                'name': 'Wine',
                'minimum_price': 6.00,
                'current_price': 8.00,
                'price_step_size': 0.50,
                'list_position': 2,
                'trend': 'stable',
                'sales_count': 0,
                'last_sale': None
            },
            {
                'id': 3,
                'name': 'Cocktail',
                'minimum_price': 8.00,
                'current_price': 12.00,
                'price_step_size': 1.00,
                'list_position': 3,
                'trend': 'stable',
                'sales_count': 0,
                'last_sale': None
            },
            {
                'id': 4,
                'name': 'Spirits',
                'minimum_price': 7.00,
                'current_price': 10.00,
                'price_step_size': 0.75,
                'list_position': 4,
                'trend': 'stable',
                'sales_count': 0,
                'last_sale': None
            }
        ]
        
        # Update current data with default drinks
        self.current_data['drinks'] = default_drinks
        self.current_data = self._update_metadata(self.current_data)
        
        logger.info(f"Created default data with {len(default_drinks)} sample drinks")
    
    def load_from_backup(self, backup_name: Optional[str] = None) -> bool:
        """
        Load data from a backup file with validation and integrity checking.
        
        Implements FR-005: Load system settings and drink list from
        the most recent backup file if one exists.
        
        Args:
            backup_name: Optional specific backup file name
            
        Returns:
            bool: True if loaded successfully
            
        Raises:
            BackupCorruptedError: If backup file is corrupted
            DataValidationError: If backup data fails validation
        """
        try:
            if backup_name:
                backup_file = self.backup_dir / backup_name
            else:
                # Find most recent backup
                backup_file = self._find_most_recent_backup()
            
            if not backup_file or not backup_file.exists():
                logger.info("No backup file found, creating default data with sample drinks")
                self._create_default_drinks_data()
                return True
            
            logger.info(f"Loading backup from {backup_file}")
            
            with self._file_lock(backup_file):
                with open(backup_file, 'r') as f:
                    loaded_data = yaml.load(f, Loader=OrderedDictYAMLLoader)
            
            logger.debug(f"Loaded backup data keys: {list(loaded_data.keys()) if isinstance(loaded_data, dict) else 'Invalid format'}")
            if isinstance(loaded_data, dict):
                drinks_count = len(loaded_data.get('drinks', []))
                settings_keys = list(loaded_data.get('settings', {}).keys())
                logger.debug(f"Backup contains {drinks_count} drinks and settings: {settings_keys}")
            
            # Check if this is old v4 format (flat structure with drink names as keys)
            if self._is_v4_backup_format(loaded_data):
                logger.info("Detected v4 backup format, migrating to v5")
                new_data = self._migrate_v4_to_v5(loaded_data)
            else:
                # Validate v5 file format and structure
                try:
                    validated_backup = self.backup_schema.load(loaded_data)
                except Exception as e:
                    logger.warning(f"v5 backup validation failed: {e}")
                    # Try to preserve any drinks data from the file even if validation fails
                    if isinstance(loaded_data, dict) and 'drinks' in loaded_data and loaded_data['drinks']:
                        logger.info("Preserving drinks data from backup despite validation errors")
                        self.current_data['drinks'] = loaded_data['drinks']
                        if 'settings' in loaded_data:
                            # Merge valid settings, skip invalid ones
                            for key, value in loaded_data['settings'].items():
                                if key in ['refresh_cycle', 'display_title', 'sound_enabled', 'auto_backup_enabled']:
                                    self.current_data['settings'][key] = value
                        self.current_data = self._update_metadata(self.current_data)
                        logger.info(f"Successfully preserved {len(self.current_data['drinks'])} drinks from backup despite validation errors")
                        return True
                    else:
                        logger.warning("No valid drinks data found in backup, falling back to defaults")
                        self._create_default_drinks_data()
                        return True
                
                # Reconstruct application data format
                new_data = {
                    'metadata': {
                        'version': loaded_data.get('backup_version', '5.0.0'),
                        'last_updated': self.get_current_timestamp(),
                        'backup_source': backup_file.name
                    },
                    'settings': loaded_data.get('settings', {}),
                    'drinks': loaded_data.get('drinks', [])
                }
            
            # Validate business rules
            logger.debug("Validating business rules for backup data")
            validation_errors = self._validate_business_rules(new_data)
            if validation_errors:
                logger.error(f"Business rules validation failed: {validation_errors}")
                raise DataValidationError(f"Backup data validation failed: {validation_errors}")
            
            # Update metadata and integrity checksum
            new_data = self._update_metadata(new_data)
            
            # Apply data
            self.current_data = new_data
            
            logger.info(f"Successfully loaded backup with {len(self.current_data['drinks'])} drinks and settings: {list(self.current_data['settings'].keys())}")
            return True
            
        except (BackupCorruptedError, DataValidationError) as e:
            logger.warning(f"Backup loading failed ({type(e).__name__}): {e}")
            logger.info("Keeping existing data, not overriding with defaults")
            return False
        except Exception as e:
            logger.error(f"Failed to load from backup: {e}")
            logger.info("Keeping existing data, not overriding with defaults")
            return False
    
    def create_backup(self, backup_name: Optional[str] = None, description: str = "") -> str:
        """
        Create a backup file with current data and integrity verification.
        
        Implements FR-004: Backup system creates daily backups with validation.
        
        Args:
            backup_name: Optional custom backup name
            description: Optional backup description
            
        Returns:
            str: Path to created backup file
            
        Raises:
            DataValidationError: If current data fails validation
            FileOperationError: If backup creation fails
        """
        try:
            # Generate backup name if not provided
            if not backup_name:
                backup_name = f"{datetime.now().strftime('%Y-%m-%d')}-backup.yaml"
            
            backup_file = self.backup_dir / backup_name
            
            logger.info(f"Creating backup: {backup_file}")
            
            # Validate current data before backup
            validation_errors = self._validate_business_rules(self.current_data)
            if validation_errors:
                raise DataValidationError(f"Cannot backup invalid data: {validation_errors}")
            
            # Create backup data structure
            backup_data = {
                'backup_name': backup_name,
                'backup_date': datetime.now().isoformat(),
                'backup_version': '5.0.0',
                'created_by': 'Abbey Stock Exchange v5',
                'description': description,
                'settings': self.current_data['settings'],
                'drinks': self.current_data['drinks']
            }
            
            # Validate backup structure
            try:
                self.backup_schema.load(backup_data)
            except Exception as e:
                raise DataValidationError(f"Backup structure validation failed: {e}")
            
            # Atomic write operation using temporary file
            temp_file = backup_file.with_suffix('.tmp')
            
            try:
                with self._file_lock(backup_file):
                    # Write to temporary file first
                    with open(temp_file, 'w') as f:
                        yaml.dump(backup_data, f, Dumper=OrderedDictYAMLDumper, 
                                default_flow_style=False, sort_keys=False)
                    
                    # Verify written file
                    with open(temp_file, 'r') as f:
                        verification_data = yaml.load(f, Loader=OrderedDictYAMLLoader)
                    
                    # Ensure data integrity
                    if verification_data != backup_data:
                        raise FileOperationError("Backup verification failed - data corruption detected")
                    
                    # Atomic move to final location
                    shutil.move(str(temp_file), str(backup_file))
                
                logger.info(f"Backup created successfully: {backup_file}")
                
                # Cleanup old backups if retention policy is set
                self._cleanup_old_backups()
                
                return str(backup_file)
                
            except Exception as e:
                # Cleanup temporary file on error
                temp_file.unlink(missing_ok=True)
                raise
                
        except (DataValidationError, FileOperationError):
            raise
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
            raise DataManagerError(f"Backup creation failed: {e}")
    
    def _find_most_recent_backup(self) -> Optional[Path]:
        """
        Find the most recent backup file based on filename timestamp.
        
        Returns:
            Optional[Path]: Path to most recent backup or None
        """
        backup_pattern = "*-backup.yaml"
        backup_files = list(self.backup_dir.glob(backup_pattern))
        
        if not backup_files:
            return None
        
        # Sort by filename (which contains date)
        backup_files.sort(reverse=True)
        return backup_files[0]
    
    def _cleanup_old_backups(self):
        """Clean up old backup files based on retention policy."""
        if not self.config.get('AUTO_BACKUP_ENABLED', True):
            return
        
        retention_days = self.config.get('BACKUP_RETENTION_DAYS', 30)
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        
        backup_files = list(self.backup_dir.glob("*-backup.yaml"))
        
        for backup_file in backup_files:
            try:
                # Extract date from filename
                date_str = backup_file.stem.split('-backup')[0]
                backup_date = datetime.strptime(date_str, '%Y-%m-%d')
                
                if backup_date < cutoff_date:
                    backup_file.unlink()
                    logger.info(f"Removed old backup: {backup_file}")
                    
            except (ValueError, OSError) as e:
                logger.warning(f"Failed to process backup file {backup_file}: {e}")
    
    def update_drinks(self, drinks_data: List[Dict[str, Any]]) -> bool:
        """
        Update drinks data with validation and atomic operation.
        
        Args:
            drinks_data: List of drink dictionaries
            
        Returns:
            bool: True if update successful
            
        Raises:
            DataValidationError: If drinks data fails validation
        """
        # Save current state for rollback
        old_drinks = self.current_data['drinks']
        
        try:
            # Validate drinks data
            validated_drinks = self.drink_schema.load(drinks_data)
            
            # Business rule validation
            validation_errors = self._validate_business_rules({
                'drinks': validated_drinks,
                'settings': self.current_data['settings']
            })
            
            if validation_errors:
                raise DataValidationError(f"Drinks update validation failed: {validation_errors}")
            
            # Update data atomically
            self.current_data['drinks'] = validated_drinks
            self.current_data = self._update_metadata(self.current_data)
            
            # Auto-save to backup file (source of truth)
            try:
                backup_path = self.create_backup()
                logger.info(f"Auto-saved drinks data to backup file: {backup_path}")
            except Exception as e:
                logger.error(f"CRITICAL: Failed to auto-save to backup file: {e}")
                # Rollback in-memory changes if backup fails
                self.current_data['drinks'] = old_drinks
                raise DataManagerError(f"Backup persistence failed - drinks update rolled back: {e}")
            
            logger.info(f"Updated {len(validated_drinks)} drinks and persisted to backup")
            return True
            
        except DataValidationError:
            raise
        except Exception as e:
            # Rollback on error
            self.current_data['drinks'] = old_drinks
            logger.error(f"Failed to update drinks: {e}")
            raise DataManagerError(f"Drinks update failed: {e}")
    
    def update_settings(self, settings_data: Dict[str, Any]) -> bool:
        """
        Update settings data with validation.
        
        Args:
            settings_data: Settings dictionary
            
        Returns:
            bool: True if update successful
            
        Raises:
            DataValidationError: If settings data fails validation
        """
        try:
            # Validate settings data
            validated_settings = self.settings_schema.load(settings_data)
            
            # Update data atomically
            old_settings = self.current_data['settings']
            self.current_data['settings'].update(validated_settings)
            self.current_data = self._update_metadata(self.current_data)
            
            # Auto-save to backup file (source of truth)
            try:
                self.create_backup()
                logger.debug("Auto-saved settings data to backup file")
            except Exception as e:
                logger.warning(f"Failed to auto-save to backup: {e}")
            
            logger.info("Settings updated successfully")
            return True
            
        except Exception as e:
            # Rollback on error
            self.current_data['settings'] = old_settings
            logger.error(f"Failed to update settings: {e}")
            raise DataManagerError(f"Settings update failed: {e}")
    
    def get_backup_list(self) -> List[Dict[str, Any]]:
        """
        Get list of available backup files with metadata.
        
        Returns:
            List[Dict]: List of backup metadata dictionaries
        """
        backups = []
        backup_files = list(self.backup_dir.glob("*-backup.yaml"))
        
        for backup_file in sorted(backup_files, reverse=True):
            try:
                stat = backup_file.stat()
                backups.append({
                    'name': backup_file.name,
                    'path': str(backup_file),
                    'size': stat.st_size,
                    'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'is_valid': self._verify_backup_integrity(backup_file)
                })
            except Exception as e:
                logger.warning(f"Failed to get metadata for {backup_file}: {e}")
        
        return backups
    
    def _verify_backup_integrity(self, backup_file: Path) -> bool:
        """
        Verify backup file integrity without loading full data.
        
        Args:
            backup_file: Path to backup file
            
        Returns:
            bool: True if backup appears valid
        """
        try:
            with open(backup_file, 'r') as f:
                data = yaml.load(f, Loader=OrderedDictYAMLLoader)
            
            # Basic structure check
            required_keys = ['backup_name', 'backup_date', 'settings', 'drinks']
            return all(key in data for key in required_keys)
            
        except Exception:
            return False
    
    def is_healthy(self) -> bool:
        """
        Check if the data manager is in a healthy state.
        
        Returns:
            bool: True if healthy, False otherwise
        """
        try:
            # Check directories exist
            if not all([self.backup_dir.exists(), self.schemas_dir.exists()]):
                return False
            
            # Check data integrity
            if not self._validate_data_integrity(self.current_data):
                return False
            
            # Check current data is valid
            validation_errors = self._validate_business_rules(self.current_data)
            if validation_errors:
                logger.warning(f"Data manager health check failed: {validation_errors}")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    def get_current_timestamp(self) -> str:
        """
        Get current timestamp in ISO format.
        
        Returns:
            str: Current timestamp
        """
        return datetime.now().isoformat()
    
    def get_drinks(self) -> List[Dict[str, Any]]:
        """
        Get current drinks data.
        
        Returns:
            List[Dict]: List of drink dictionaries
        """
        return self.current_data.get('drinks', [])
    
    def get_settings(self) -> Dict[str, Any]:
        """
        Get current settings data.
        
        Returns:
            Dict: Settings dictionary
        """
        return self.current_data.get('settings', {})
    
    def get_metadata(self) -> Dict[str, Any]:
        """
        Get current metadata.
        
        Returns:
            Dict: Metadata dictionary
        """
        return self.current_data.get('metadata', {})