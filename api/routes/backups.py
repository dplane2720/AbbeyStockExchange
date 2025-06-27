"""
Abbey Stock Exchange v5 - Backup API Routes

This module contains all REST API endpoints for backup management
including creation, restoration, and listing of backup files.
"""

from flask import current_app
from flask_restful import Resource, request
from marshmallow import ValidationError
from pathlib import Path
import logging

from api.validators.backup_schema import (
    BackupSchema, BackupCreateSchema, BackupRestoreSchema
)
from core.data_manager import (
    DataManager, DataValidationError, DataManagerError, 
    BackupCorruptedError, FileOperationError
)

logger = logging.getLogger('abbey.api.backups')


class BackupList(Resource):
    """API endpoint for backup list operations."""
    
    def get(self):
        """
        Get list of available backups with metadata.
        
        Returns:
            JSON: List of backup files with metadata
            
        Example Response:
            {
                "success": true,
                "data": [
                    {
                        "name": "2024-06-23-backup.yaml",
                        "path": "/path/to/backup.yaml",
                        "size": 2048,
                        "created": "2024-06-23T10:30:00",
                        "is_valid": true
                    }
                ],
                "metadata": {
                    "total_count": 1
                }
            }
        """
        try:
            # Use the enhanced backup manager for detailed metadata
            backup_list = current_app.backup_manager.get_backup_list_with_metadata()
            
            response = {
                'success': True,
                'data': backup_list,
                'metadata': {
                    'total_count': len(backup_list),
                    'backup_status': current_app.backup_manager.get_backup_status()
                }
            }
            
            logger.info(f"Retrieved {len(backup_list)} backup files")
            return response, 200
            
        except Exception as e:
            logger.error(f"Failed to get backup list: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve backup list',
                'message': str(e)
            }, 500
    
    def post(self):
        """
        Create a new backup.
        
        Request Body:
            {
                "description": "Manual backup",     // Optional
                "backup_type": "manual",            // Optional, defaults to "manual"
                "backup_name": "custom-backup.yaml" // Optional, auto-generated if not provided
            }
            
        Returns:
            JSON: Created backup information
        """
        try:
            # Validate input data
            create_schema = BackupCreateSchema()
            validated_data = {}
            
            if request.is_json and request.json:
                try:
                    validated_data = create_schema.load(request.json)
                except ValidationError as e:
                    return {
                        'success': False,
                        'error': 'Validation failed',
                        'details': e.messages
                    }, 400
            else:
                # Use defaults for empty request
                validated_data = create_schema.load({})
            
            # Use enhanced backup manager for verification and metadata
            result = current_app.backup_manager.create_backup_with_verification(
                backup_name=validated_data.get('backup_name'),
                description=validated_data.get('description', '')
            )
            
            if not result['success']:
                return {
                    'success': False,
                    'error': 'Backup creation failed',
                    'message': result.get('error', 'Unknown error')
                }, 500
            
            backup_info = result['metadata']
            
            logger.info(f"Created backup: {backup_info['backup_name']}")
            return {
                'success': True,
                'data': backup_info,
                'verification': result['verification'],
                'message': f"Backup '{backup_info['backup_name']}' created successfully"
            }, 201
            
        except DataValidationError as e:
            logger.warning(f"Backup creation validation failed: {e}")
            return {
                'success': False,
                'error': 'Data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to create backup: {e}")
            return {
                'success': False,
                'error': 'Failed to create backup',
                'message': str(e)
            }, 500


class BackupDetail(Resource):
    """API endpoint for individual backup operations."""
    
    def get(self, backup_name):
        """
        Get backup details and metadata.
        
        Args:
            backup_name (str): Name of the backup file
            
        Returns:
            JSON: Backup metadata and information
        """
        try:
            data_manager = current_app.data_manager
            backup_list = data_manager.get_backup_list()
            
            # Find backup by name
            backup_info = next((b for b in backup_list if b['name'] == backup_name), None)
            if not backup_info:
                return {
                    'success': False,
                    'error': 'Backup not found',
                    'message': f'No backup found with name {backup_name}'
                }, 404
            
            logger.info(f"Retrieved backup details: {backup_name}")
            return {
                'success': True,
                'data': backup_info
            }, 200
            
        except Exception as e:
            logger.error(f"Failed to get backup details for {backup_name}: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve backup details',
                'message': str(e)
            }, 500
    
    def delete(self, backup_name):
        """
        Delete a backup file.
        
        Args:
            backup_name (str): Name of the backup file to delete
            
        Returns:
            JSON: Success message or error
        """
        try:
            data_manager = current_app.data_manager
            backup_dir = data_manager.backup_dir
            backup_file = backup_dir / backup_name
            
            # Validate backup name format
            if not backup_name.endswith('-backup.yaml'):
                return {
                    'success': False,
                    'error': 'Invalid backup name format',
                    'message': 'Backup name must end with -backup.yaml'
                }, 400
            
            # Check if backup exists
            if not backup_file.exists():
                return {
                    'success': False,
                    'error': 'Backup not found',
                    'message': f'No backup found with name {backup_name}'
                }, 404
            
            # Delete backup file
            backup_file.unlink()
            
            logger.info(f"Deleted backup: {backup_name}")
            return {
                'success': True,
                'message': f"Backup '{backup_name}' deleted successfully"
            }, 200
            
        except Exception as e:
            logger.error(f"Failed to delete backup {backup_name}: {e}")
            return {
                'success': False,
                'error': 'Failed to delete backup',
                'message': str(e)
            }, 500


class BackupRestore(Resource):
    """API endpoint for backup restoration."""
    
    def post(self, backup_name):
        """
        Restore from the specified backup.
        
        Args:
            backup_name (str): Name of the backup file to restore from
            
        Request Body:
            {
                "create_pre_restore_backup": true,  // Optional, defaults to true
                "force_restore": false              // Optional, defaults to false
            }
            
        Returns:
            JSON: Restoration result with system status
        """
        try:
            # Validate input data
            restore_schema = BackupRestoreSchema()
            validated_data = {'backup_name': backup_name}
            
            if request.is_json and request.json:
                try:
                    request_data = request.json.copy()
                    request_data['backup_name'] = backup_name
                    validated_data = restore_schema.load(request_data)
                except ValidationError as e:
                    return {
                        'success': False,
                        'error': 'Validation failed',
                        'details': e.messages
                    }, 400
            
            # Get the backup file path
            backup_dir = Path(current_app.config['BACKUP_DIR'])
            backup_path = str(backup_dir / backup_name)
            
            # Use enhanced backup manager for validation and rollback capability
            result = current_app.backup_manager.restore_backup_with_validation(backup_path)
            
            if not result['success']:
                return {
                    'success': False,
                    'error': 'Backup restoration failed',
                    'message': result.get('error', 'Unknown error'),
                    'verification': result.get('verification'),
                    'rollback_successful': result.get('rollback_successful', False)
                }, 500
            
            # Get restoration summary
            metadata = current_app.data_manager.get_metadata()
            drinks_count = len(current_app.data_manager.get_drinks())
            
            result_data = {
                'backup_name': backup_name,
                'safety_backup': result.get('safety_backup'),
                'verification': result.get('verification'),
                'drinks_restored': drinks_count,
                'restore_timestamp': metadata.get('last_updated'),
                'system_version': metadata.get('version')
            }
            
            logger.info(f"Successfully restored from backup: {backup_name} ({drinks_count} drinks)")
            return {
                'success': True,
                'data': result_data,
                'message': f"Successfully restored from backup '{backup_name}'"
            }, 200
            
        except BackupCorruptedError as e:
            logger.error(f"Backup corruption detected during restore: {e}")
            return {
                'success': False,
                'error': 'Backup file corrupted',
                'message': str(e)
            }, 400
        except DataValidationError as e:
            logger.error(f"Backup data validation failed during restore: {e}")
            return {
                'success': False,
                'error': 'Backup data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to restore from backup {backup_name}: {e}")
            return {
                'success': False,
                'error': 'Failed to restore from backup',
                'message': str(e)
            }, 500


class BackupValidate(Resource):
    """API endpoint for backup validation without restoration."""
    
    def post(self, backup_name):
        """
        Validate a backup file without restoring it.
        
        Args:
            backup_name (str): Name of the backup file to validate
            
        Returns:
            JSON: Validation results and backup metadata
        """
        try:
            data_manager = current_app.data_manager
            backup_dir = data_manager.backup_dir
            backup_file = backup_dir / backup_name
            
            # Check if backup exists
            if not backup_file.exists():
                return {
                    'success': False,
                    'error': 'Backup not found',
                    'message': f'No backup found with name {backup_name}'
                }, 404
            
            # Validate backup integrity
            is_valid = data_manager._verify_backup_integrity(backup_file)
            
            # Get backup metadata
            validation_result = {
                'backup_name': backup_name,
                'is_valid': is_valid,
                'file_size': backup_file.stat().st_size,
                'file_exists': True
            }
            
            if is_valid:
                try:
                    # Try to read backup metadata without full restoration
                    import yaml
                    from core.data_manager import OrderedDictYAMLLoader
                    
                    with open(backup_file, 'r') as f:
                        backup_data = yaml.load(f, Loader=OrderedDictYAMLLoader)
                    
                    validation_result.update({
                        'backup_date': backup_data.get('backup_date'),
                        'backup_version': backup_data.get('backup_version'),
                        'drinks_count': len(backup_data.get('drinks', [])),
                        'has_settings': 'settings' in backup_data,
                        'created_by': backup_data.get('created_by')
                    })
                except Exception as e:
                    validation_result['validation_error'] = str(e)
                    is_valid = False
            
            status_code = 200 if is_valid else 400
            message = f"Backup '{backup_name}' is {'valid' if is_valid else 'invalid'}"
            
            logger.info(f"Validated backup {backup_name}: {'valid' if is_valid else 'invalid'}")
            return {
                'success': True,
                'data': validation_result,
                'message': message
            }, status_code
            
        except Exception as e:
            logger.error(f"Failed to validate backup {backup_name}: {e}")
            return {
                'success': False,
                'error': 'Failed to validate backup',
                'message': str(e)
            }, 500