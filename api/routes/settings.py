"""
Abbey Stock Exchange v5 - Settings API Routes

This module contains all REST API endpoints for application settings
including refresh cycle configuration and system preferences.
"""

from flask import current_app
from flask_restful import Resource, request
from marshmallow import ValidationError
import logging

from api.validators.settings_schema import SettingsSchema, RefreshCycleSchema
from core.data_manager import DataManager, DataValidationError, DataManagerError

logger = logging.getLogger('abbey.api.settings')


class AppSettings(Resource):
    """API endpoint for general application settings."""
    
    def get(self):
        """
        Get all application settings.
        
        Returns:
            JSON: Current application settings
            
        Example Response:
            {
                "success": true,
                "data": {
                    "refresh_cycle": 300,
                    "display_title": "Abbey Stock Exchange",
                    "currency_symbol": "$",
                    "sound_enabled": true,
                    "sound_volume": 70,
                    "auto_backup_enabled": true
                },
                "metadata": {
                    "last_updated": "2024-06-23T10:30:00"
                }
            }
        """
        try:
            data_manager = current_app.data_manager
            settings_data = data_manager.get_settings()
            metadata = data_manager.get_metadata()
            
            # Serialize settings data
            settings_schema = SettingsSchema()
            serialized_settings = settings_schema.dump(settings_data)
            
            response = {
                'success': True,
                'data': serialized_settings,
                'metadata': {
                    'last_updated': metadata.get('last_updated'),
                    'version': metadata.get('version')
                }
            }
            
            logger.info("Retrieved application settings")
            return response, 200
            
        except Exception as e:
            logger.error(f"Failed to get settings: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve settings',
                'message': str(e)
            }, 500
    
    def put(self):
        """
        Update application settings.
        
        Request Body:
            {
                "refresh_cycle": 600,           // Optional
                "display_title": "New Title",   // Optional
                "sound_enabled": false,         // Optional
                "sound_volume": 80,             // Optional
                "auto_backup_enabled": true     // Optional
            }
            
        Returns:
            JSON: Updated settings data
        """
        try:
            if not request.is_json:
                return {
                    'success': False,
                    'error': 'Content-Type must be application/json'
                }, 400
            
            # Validate input data
            settings_schema = SettingsSchema()
            try:
                validated_data = settings_schema.load(request.json)
            except ValidationError as e:
                return {
                    'success': False,
                    'error': 'Validation failed',
                    'details': e.messages
                }, 400
            
            data_manager = current_app.data_manager
            
            # Update settings
            success = data_manager.update_settings(validated_data)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to update settings'
                }, 500
            
            # Update price engine refresh cycle if it changed
            if 'refresh_cycle' in validated_data:
                try:
                    price_engine = current_app.price_engine
                    if hasattr(price_engine, 'update_refresh_cycle'):
                        price_engine.update_refresh_cycle(validated_data['refresh_cycle'])
                        logger.info(f"Price engine refresh cycle updated to {validated_data['refresh_cycle']}s")
                        
                        # Broadcast timer update to connected clients
                        websocket_manager = current_app.websocket_manager
                        if websocket_manager:
                            websocket_manager.broadcast_timer_update({
                                'refresh_cycle': validated_data['refresh_cycle'],
                                'time_remaining': validated_data['refresh_cycle']
                            })
                except Exception as e:
                    logger.warning(f"Failed to update price engine refresh cycle: {e}")
            
            # Return updated settings
            updated_settings = data_manager.get_settings()
            serialized_settings = settings_schema.dump(updated_settings)
            
            logger.info(f"Updated application settings: {list(validated_data.keys())}")
            return {
                'success': True,
                'data': serialized_settings,
                'message': 'Settings updated successfully'
            }, 200
            
        except DataValidationError as e:
            logger.warning(f"Settings update validation failed: {e}")
            return {
                'success': False,
                'error': 'Data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to update settings: {e}")
            return {
                'success': False,
                'error': 'Failed to update settings',
                'message': str(e)
            }, 500


class RefreshCycle(Resource):
    """API endpoint for refresh cycle configuration."""
    
    def get(self):
        """
        Get current refresh cycle settings with formatted display.
        
        Returns:
            JSON: Refresh cycle data with human-readable format
            
        Example Response:
            {
                "success": true,
                "data": {
                    "refresh_cycle": 300,
                    "refresh_cycle_minutes": 5.0,
                    "refresh_cycle_display": "5m"
                }
            }
        """
        try:
            data_manager = current_app.data_manager
            settings_data = data_manager.get_settings()
            
            # Create refresh cycle data
            refresh_data = {
                'refresh_cycle': settings_data.get('refresh_cycle', 300)
            }
            
            # Serialize with formatting
            cycle_schema = RefreshCycleSchema()
            serialized_cycle = cycle_schema.dump(refresh_data)
            
            logger.info("Retrieved refresh cycle settings")
            return {
                'success': True,
                'data': serialized_cycle
            }, 200
            
        except Exception as e:
            logger.error(f"Failed to get refresh cycle: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve refresh cycle',
                'message': str(e)
            }, 500
    
    def put(self):
        """
        Update refresh cycle settings.
        
        Request Body:
            {
                "refresh_cycle": 600    // Seconds, must be 60-3600 and divisible by 30
            }
            
        Returns:
            JSON: Updated refresh cycle data with formatting
        """
        try:
            if not request.is_json:
                return {
                    'success': False,
                    'error': 'Content-Type must be application/json'
                }, 400
            
            # Validate input data
            cycle_schema = RefreshCycleSchema()
            try:
                validated_data = cycle_schema.load(request.json)
            except ValidationError as e:
                return {
                    'success': False,
                    'error': 'Validation failed',
                    'details': e.messages
                }, 400
            
            data_manager = current_app.data_manager
            
            # Update only the refresh cycle setting
            settings_update = {
                'refresh_cycle': validated_data['refresh_cycle']
            }
            
            success = data_manager.update_settings(settings_update)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to update refresh cycle'
                }, 500
            
            # Return updated refresh cycle with formatting
            serialized_cycle = cycle_schema.dump(validated_data)
            
            logger.info(f"Updated refresh cycle to {validated_data['refresh_cycle']} seconds")
            return {
                'success': True,
                'data': serialized_cycle,
                'message': f"Refresh cycle updated to {serialized_cycle['refresh_cycle_display']}"
            }, 200
            
        except DataValidationError as e:
            logger.warning(f"Refresh cycle update validation failed: {e}")
            return {
                'success': False,
                'error': 'Data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to update refresh cycle: {e}")
            return {
                'success': False,
                'error': 'Failed to update refresh cycle',
                'message': str(e)
            }, 500


class SystemStatus(Resource):
    """API endpoint for system status and health checks."""
    
    def get(self):
        """
        Get system status and health information.
        
        Returns:
            JSON: System status with health metrics
        """
        try:
            data_manager = current_app.data_manager
            
            # Get system health information
            is_healthy = data_manager.is_healthy()
            metadata = data_manager.get_metadata()
            drinks_count = len(data_manager.get_drinks())
            settings = data_manager.get_settings()
            
            # Get backup information
            try:
                backup_list = data_manager.get_backup_list()
                latest_backup = backup_list[0] if backup_list else None
            except Exception:
                latest_backup = None
                backup_list = []
            
            # Calculate next refresh time from price engine
            try:
                price_engine = current_app.price_engine
                if hasattr(price_engine, 'get_next_refresh_time'):
                    next_refresh_dt = price_engine.get_next_refresh_time()
                    next_refresh = next_refresh_dt.isoformat() if next_refresh_dt else None
                else:
                    # Fallback: calculate based on last update + refresh cycle
                    import datetime
                    last_updated = metadata.get('last_updated')
                    if last_updated:
                        from datetime import datetime as dt
                        last_time = dt.fromisoformat(last_updated.replace('Z', '+00:00'))
                        refresh_cycle = settings.get('refresh_cycle', 300)
                        next_refresh = (last_time + datetime.timedelta(seconds=refresh_cycle)).isoformat()
                    else:
                        next_refresh = None
            except Exception as e:
                logger.warning(f"Failed to calculate next refresh time: {e}")
                next_refresh = None
            
            status_data = {
                'system_healthy': is_healthy,
                'version': metadata.get('version', '5.0.0'),
                'last_updated': metadata.get('last_updated'),
                'drinks_count': drinks_count,
                'backups_count': len(backup_list),
                'latest_backup': latest_backup['name'] if latest_backup else None,
                'refresh_cycle': settings.get('refresh_cycle', 300),
                'auto_backup_enabled': settings.get('auto_backup_enabled', True),
                'next_refresh': next_refresh
            }
            
            status_code = 200 if is_healthy else 503
            
            logger.info(f"System status check: {'healthy' if is_healthy else 'unhealthy'}")
            return {
                'success': True,
                'data': status_data,
                'message': 'System is operational' if is_healthy else 'System health issues detected'
            }, status_code
            
        except Exception as e:
            logger.error(f"Failed to get system status: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve system status',
                'message': str(e)
            }, 500


class PriceEngineControl(Resource):
    """API endpoint for price engine control and manual updates."""
    
    def post(self):
        """
        Force an immediate price update cycle.
        
        This endpoint allows manual triggering of the price calculation
        and update process for testing and debugging purposes.
        
        Returns:
            JSON: Results of the manual price update
        """
        try:
            price_engine = current_app.price_engine
            
            if not price_engine.is_running():
                return {
                    'success': False,
                    'error': 'Price engine is not running',
                    'message': 'Start the price engine before triggering manual updates'
                }, 400
            
            logger.info("Manual price update triggered via API")
            
            # Force immediate price update
            update_results = price_engine.force_price_update()
            
            # Format response with detailed results
            response_data = {
                'success': True,
                'message': 'Manual price update completed successfully',
                'results': {
                    'drinks_processed': len(update_results['drinks']),
                    'prices_changed': len(update_results['changes']),
                    'timestamp': update_results['timestamp'],
                    'changes': update_results['changes']
                }
            }
            
            if update_results['changes']:
                logger.info(f"Manual update changed {len(update_results['changes'])} prices: {list(update_results['changes'].keys())}")
            else:
                logger.info("Manual update completed with no price changes")
            
            return response_data, 200
            
        except Exception as e:
            logger.error(f"Failed to execute manual price update: {e}")
            import traceback
            logger.error(f"Manual update error traceback: {traceback.format_exc()}")
            return {
                'success': False,
                'error': 'Manual price update failed',
                'message': str(e)
            }, 500
    
    def get(self):
        """
        Get price engine status and timing information.
        
        Returns:
            JSON: Price engine status and schedule information
        """
        try:
            price_engine = current_app.price_engine
            data_manager = current_app.data_manager
            
            # Get price engine status
            engine_status = price_engine.get_engine_status()
            
            # Get current drinks with sales data
            current_drinks = data_manager.get_drinks()
            drinks_with_sales = [d for d in current_drinks if d.get('sales_count', 0) > 0]
            
            status_data = {
                'success': True,
                'data': {
                    'engine_running': engine_status.get('running', False),
                    'refresh_cycle': engine_status.get('refresh_cycle', 0),
                    'next_refresh': engine_status.get('next_refresh'),
                    'scheduler_running': engine_status.get('scheduler_running', False),
                    'active_jobs': engine_status.get('job_count', 0),
                    'drinks_with_sales': {
                        'count': len(drinks_with_sales),
                        'drinks': [{
                            'id': d['id'],
                            'name': d['name'],
                            'sales_count': d.get('sales_count', 0),
                            'current_price': str(d['current_price'])
                        } for d in drinks_with_sales]
                    },
                    'total_drinks': len(current_drinks)
                }
            }
            
            return status_data, 200
            
        except Exception as e:
            logger.error(f"Failed to get price engine status: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve price engine status',
                'message': str(e)
            }, 500