"""
Abbey Stock Exchange v5 - Advanced Backup Manager

This module implements the advanced backup system with scheduling,
versioning, retention policies, and integrity verification.
"""

import logging
import os
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger('abbey.backup_manager')


class BackupManager:
    """
    Advanced backup manager for the Abbey Stock Exchange.
    
    Provides automated backup scheduling, versioning, retention policies,
    backup integrity verification, and compression optimization.
    """
    
    def __init__(self, data_manager, config):
        """
        Initialize the advanced backup manager.
        
        Args:
            data_manager: Data manager instance
            config: Application configuration
        """
        self.data_manager = data_manager
        self.config = config
        self.scheduler = BackgroundScheduler()
        self.is_running = False
        self.backup_job = None
        
        # Backup configuration
        self.backup_dir = Path(config['BACKUP_DIR'])
        self.retention_days = config.get('BACKUP_RETENTION_DAYS', 30)
        self.max_backups = config.get('MAX_BACKUP_COUNT', 50)
        self.auto_backup_enabled = config.get('AUTO_BACKUP_ENABLED', True)
        self.backup_schedule = config.get('BACKUP_SCHEDULE', '0 0 * * *')  # Daily at midnight
        
        logger.info("Advanced Backup Manager initialized")
    
    def start_scheduler(self):
        """Start the backup scheduler for automated backups."""
        try:
            if self.is_running:
                logger.warning("Backup scheduler is already running")
                return
            
            if not self.auto_backup_enabled:
                logger.info("Automated backups are disabled")
                return
            
            # Start the scheduler
            self.scheduler.start()
            
            # Schedule automatic backups
            self.backup_job = self.scheduler.add_job(
                self._create_automatic_backup,
                trigger=CronTrigger.from_crontab(self.backup_schedule),
                id='automatic_backup',
                replace_existing=True,
                max_instances=1
            )
            
            self.is_running = True
            logger.info(f"Backup scheduler started with schedule: {self.backup_schedule}")
            
        except Exception as e:
            logger.error(f"Failed to start backup scheduler: {e}")
            raise
    
    def stop_scheduler(self):
        """Stop the backup scheduler."""
        try:
            if not self.is_running:
                logger.warning("Backup scheduler is not running")
                return
            
            # Remove the backup job
            if self.backup_job:
                self.scheduler.remove_job('automatic_backup')
                self.backup_job = None
            
            # Shutdown the scheduler
            self.scheduler.shutdown(wait=True)
            
            self.is_running = False
            logger.info("Backup scheduler stopped")
            
        except Exception as e:
            logger.error(f"Failed to stop backup scheduler: {e}")
            raise
    
    def create_backup_with_verification(self, backup_name: Optional[str] = None, 
                                      description: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a backup with comprehensive verification and metadata.
        
        Args:
            backup_name: Optional backup filename
            description: Optional backup description
            
        Returns:
            dict: Backup creation results with verification info
        """
        try:
            logger.info("Creating verified backup")
            
            # Create the backup using data manager
            backup_path = self.data_manager.create_backup(backup_name, description)
            
            # Verify backup integrity
            verification_result = self.verify_backup_integrity(backup_path)
            
            # Calculate backup size and checksums
            backup_file = Path(backup_path)
            file_size = backup_file.stat().st_size
            file_checksum = self._calculate_file_checksum(backup_path)
            
            # Create backup metadata
            metadata = {
                'backup_path': backup_path,
                'backup_name': backup_file.name,
                'created_at': datetime.now().isoformat(),
                'file_size': file_size,
                'file_checksum': file_checksum,
                'verification_passed': verification_result['valid'],
                'description': description or 'Manual backup',
                'backup_type': 'manual'
            }
            
            # Save metadata
            self._save_backup_metadata(backup_file.stem, metadata)
            
            logger.info(f"Verified backup created: {backup_path}")
            
            return {
                'success': True,
                'backup_path': backup_path,
                'metadata': metadata,
                'verification': verification_result
            }
            
        except Exception as e:
            logger.error(f"Failed to create verified backup: {e}")
            return {
                'success': False,
                'error': str(e),
                'backup_path': None
            }
    
    def verify_backup_integrity(self, backup_path: str) -> Dict[str, Any]:
        """
        Verify the integrity of a backup file.
        
        Args:
            backup_path: Path to backup file
            
        Returns:
            dict: Verification results
        """
        try:
            backup_file = Path(backup_path)
            
            if not backup_file.exists():
                return {
                    'valid': False,
                    'error': 'Backup file does not exist',
                    'checks': {}
                }
            
            verification_checks = {}
            
            # Check file size
            file_size = backup_file.stat().st_size
            verification_checks['file_size'] = {
                'passed': file_size > 0,
                'value': file_size,
                'description': 'File is not empty'
            }
            
            # Check YAML structure
            try:
                backup_data = self.data_manager.load_backup_file(backup_path)
                verification_checks['yaml_structure'] = {
                    'passed': True,
                    'description': 'Valid YAML structure'
                }
            except Exception as e:
                verification_checks['yaml_structure'] = {
                    'passed': False,
                    'error': str(e),
                    'description': 'Invalid YAML structure'
                }
                return {
                    'valid': False,
                    'error': f'YAML validation failed: {e}',
                    'checks': verification_checks
                }
            
            # Check required fields
            required_fields = ['settings', 'drinks', 'backup_date', 'backup_version']
            missing_fields = [field for field in required_fields if field not in backup_data]
            
            verification_checks['required_fields'] = {
                'passed': len(missing_fields) == 0,
                'missing_fields': missing_fields,
                'description': 'All required fields present'
            }
            
            # Check data validity
            try:
                self.data_manager.backup_schema.load(backup_data)
                verification_checks['schema_validation'] = {
                    'passed': True,
                    'description': 'Schema validation passed'
                }
            except Exception as e:
                verification_checks['schema_validation'] = {
                    'passed': False,
                    'error': str(e),
                    'description': 'Schema validation failed'
                }
            
            # Overall validity
            all_checks_passed = all(
                check.get('passed', False) 
                for check in verification_checks.values()
            )
            
            return {
                'valid': all_checks_passed,
                'checks': verification_checks,
                'verified_at': datetime.now().isoformat(),
                'backup_path': backup_path
            }
            
        except Exception as e:
            logger.error(f"Backup verification failed: {e}")
            return {
                'valid': False,
                'error': str(e),
                'checks': {}
            }
    
    def restore_backup_with_validation(self, backup_path: str) -> Dict[str, Any]:
        """
        Restore a backup with pre-validation and rollback capability.
        
        Args:
            backup_path: Path to backup file to restore
            
        Returns:
            dict: Restoration results
        """
        try:
            logger.info(f"Restoring backup with validation: {backup_path}")
            
            # Verify backup before restoration
            verification_result = self.verify_backup_integrity(backup_path)
            
            if not verification_result['valid']:
                return {
                    'success': False,
                    'error': 'Backup failed verification',
                    'verification': verification_result
                }
            
            # Create safety backup of current state
            safety_backup_path = self.data_manager.create_backup(
                f"safety-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.yaml",
                "Safety backup before restoration"
            )
            
            try:
                # Perform the restoration
                restoration_result = self.data_manager.restore_from_backup(backup_path)
                
                logger.info(f"Backup restored successfully from: {backup_path}")
                
                return {
                    'success': True,
                    'backup_path': backup_path,
                    'safety_backup': safety_backup_path,
                    'verification': verification_result,
                    'restoration_result': restoration_result
                }
                
            except Exception as restore_error:
                # Attempt to rollback using safety backup
                logger.error(f"Restoration failed, attempting rollback: {restore_error}")
                
                try:
                    self.data_manager.restore_from_backup(safety_backup_path)
                    logger.info("Rollback successful")
                    
                    return {
                        'success': False,
                        'error': f'Restoration failed: {restore_error}',
                        'rollback_successful': True,
                        'safety_backup': safety_backup_path
                    }
                    
                except Exception as rollback_error:
                    logger.error(f"Rollback also failed: {rollback_error}")
                    
                    return {
                        'success': False,
                        'error': f'Restoration failed: {restore_error}',
                        'rollback_successful': False,
                        'rollback_error': str(rollback_error),
                        'safety_backup': safety_backup_path
                    }
            
        except Exception as e:
            logger.error(f"Backup restoration process failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_backup_list_with_metadata(self) -> List[Dict[str, Any]]:
        """
        Get a list of all backups with their metadata.
        
        Returns:
            list: List of backup information with metadata
        """
        try:
            backup_files = list(self.backup_dir.glob("*-backup.yaml"))
            backup_list = []
            
            for backup_file in sorted(backup_files, reverse=True):
                try:
                    # Basic file information
                    file_stat = backup_file.stat()
                    backup_info = {
                        'name': backup_file.name,
                        'path': str(backup_file),
                        'size': file_stat.st_size,
                        'created_at': datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                        'modified_at': datetime.fromtimestamp(file_stat.st_mtime).isoformat()
                    }
                    
                    # Try to load metadata
                    metadata = self._load_backup_metadata(backup_file.stem)
                    if metadata:
                        backup_info.update(metadata)
                    
                    # Quick verification check
                    backup_info['verified'] = self._quick_backup_check(str(backup_file))
                    
                    backup_list.append(backup_info)
                    
                except Exception as e:
                    logger.warning(f"Error processing backup {backup_file}: {e}")
                    backup_list.append({
                        'name': backup_file.name,
                        'path': str(backup_file),
                        'error': str(e),
                        'verified': False
                    })
            
            return backup_list
            
        except Exception as e:
            logger.error(f"Failed to get backup list: {e}")
            return []
    
    def cleanup_old_backups(self) -> Dict[str, Any]:
        """
        Clean up old backups based on retention policies.
        
        Returns:
            dict: Cleanup results
        """
        try:
            logger.info("Starting backup cleanup")
            
            backup_files = list(self.backup_dir.glob("*-backup.yaml"))
            
            # Sort by modification time (oldest first)
            backup_files.sort(key=lambda f: f.stat().st_mtime)
            
            deleted_count = 0
            kept_count = 0
            errors = []
            
            # Remove backups older than retention period
            cutoff_date = datetime.now() - timedelta(days=self.retention_days)
            
            for backup_file in backup_files:
                try:
                    file_time = datetime.fromtimestamp(backup_file.stat().st_mtime)
                    
                    # Check if file is too old or if we exceed max backup count
                    should_delete = (
                        file_time < cutoff_date or 
                        (kept_count >= self.max_backups)
                    )
                    
                    if should_delete:
                        # Remove metadata file if it exists
                        metadata_file = self.backup_dir / f"{backup_file.stem}.meta"
                        if metadata_file.exists():
                            metadata_file.unlink()
                        
                        # Remove backup file
                        backup_file.unlink()
                        deleted_count += 1
                        logger.debug(f"Deleted old backup: {backup_file.name}")
                    else:
                        kept_count += 1
                        
                except Exception as e:
                    error_msg = f"Error deleting {backup_file.name}: {e}"
                    errors.append(error_msg)
                    logger.warning(error_msg)
            
            logger.info(f"Backup cleanup completed: {deleted_count} deleted, {kept_count} kept")
            
            return {
                'success': True,
                'deleted_count': deleted_count,
                'kept_count': kept_count,
                'errors': errors
            }
            
        except Exception as e:
            logger.error(f"Backup cleanup failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'deleted_count': 0,
                'kept_count': 0
            }
    
    def get_backup_status(self) -> Dict[str, Any]:
        """
        Get comprehensive backup system status.
        
        Returns:
            dict: Backup system status information
        """
        try:
            backup_files = list(self.backup_dir.glob("*-backup.yaml"))
            
            # Calculate total backup size
            total_size = sum(f.stat().st_size for f in backup_files)
            
            # Find most recent backup
            most_recent = None
            if backup_files:
                most_recent_file = max(backup_files, key=lambda f: f.stat().st_mtime)
                most_recent = {
                    'name': most_recent_file.name,
                    'created_at': datetime.fromtimestamp(most_recent_file.stat().st_mtime).isoformat(),
                    'size': most_recent_file.stat().st_size
                }
            
            return {
                'scheduler_running': self.is_running,
                'auto_backup_enabled': self.auto_backup_enabled,
                'backup_schedule': self.backup_schedule,
                'backup_count': len(backup_files),
                'total_backup_size': total_size,
                'retention_days': self.retention_days,
                'max_backups': self.max_backups,
                'backup_directory': str(self.backup_dir),
                'most_recent_backup': most_recent,
                'next_scheduled_backup': self._get_next_backup_time()
            }
            
        except Exception as e:
            logger.error(f"Failed to get backup status: {e}")
            return {
                'scheduler_running': False,
                'error': str(e)
            }
    
    def _create_automatic_backup(self):
        """Create an automatic scheduled backup."""
        try:
            logger.info("Creating automatic scheduled backup")
            
            backup_name = f"auto-{datetime.now().strftime('%Y-%m-%d')}-backup.yaml"
            result = self.create_backup_with_verification(
                backup_name=backup_name,
                description="Automatic scheduled backup"
            )
            
            if result['success']:
                logger.info(f"Automatic backup created: {result['backup_path']}")
                
                # Run cleanup after successful backup
                self.cleanup_old_backups()
            else:
                logger.error(f"Automatic backup failed: {result.get('error', 'Unknown error')}")
            
        except Exception as e:
            logger.error(f"Automatic backup process failed: {e}")
    
    def _calculate_file_checksum(self, file_path: str) -> str:
        """Calculate SHA256 checksum of a file."""
        try:
            hash_sha256 = hashlib.sha256()
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate checksum for {file_path}: {e}")
            return ""
    
    def _save_backup_metadata(self, backup_name: str, metadata: Dict[str, Any]):
        """Save backup metadata to a separate file."""
        try:
            metadata_file = self.backup_dir / f"{backup_name}.meta"
            import json
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save backup metadata: {e}")
    
    def _load_backup_metadata(self, backup_name: str) -> Optional[Dict[str, Any]]:
        """Load backup metadata from file."""
        try:
            metadata_file = self.backup_dir / f"{backup_name}.meta"
            if metadata_file.exists():
                import json
                with open(metadata_file, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.debug(f"Could not load metadata for {backup_name}: {e}")
        return None
    
    def _quick_backup_check(self, backup_path: str) -> bool:
        """Perform a quick backup validity check."""
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists() or backup_file.stat().st_size == 0:
                return False
            
            # Try to load as YAML
            self.data_manager.load_backup_file(backup_path)
            return True
        except:
            return False
    
    def _get_next_backup_time(self) -> Optional[str]:
        """Get the next scheduled backup time."""
        try:
            if self.backup_job and self.is_running:
                next_run = self.backup_job.next_run_time
                if next_run:
                    return next_run.isoformat()
        except:
            pass
        return None