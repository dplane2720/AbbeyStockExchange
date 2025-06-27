"""
Abbey Stock Exchange v5 - Drinks API Routes

This module contains all REST API endpoints for drink management
including CRUD operations and sales recording.
"""

from flask import current_app, g
from flask_restful import Resource, request
from marshmallow import ValidationError
from decimal import Decimal
import logging

from api.validators.drink_schema import (
    DrinkSchema, DrinkCreateSchema, DrinkUpdateSchema, DrinkSalesSchema
)
from core.data_manager import DataManager, DataValidationError, DataManagerError

logger = logging.getLogger('abbey.api.drinks')


class DrinkList(Resource):
    """API endpoint for drink list operations."""
    
    def get(self):
        """
        Get all drinks with current prices and trends.
        
        Returns:
            JSON: List of drinks with metadata
            
        Example Response:
            {
                "success": true,
                "data": [
                    {
                        "id": 1,
                        "name": "Abbey IPA",
                        "minimum_price": "4.00",
                        "current_price": "5.50",
                        "price_step_size": "0.50",
                        "list_position": 1,
                        "trend": "increasing",
                        "sales_count": 3
                    }
                ],
                "metadata": {
                    "total_count": 1,
                    "last_updated": "2024-06-23T10:30:00"
                }
            }
        """
        try:
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            metadata = data_manager.get_metadata()
            
            logger.debug(f"Raw drinks data from data_manager: {len(drinks_data)} drinks")
            if drinks_data:
                logger.debug(f"First drink sample: {drinks_data[0]}")
            
            # Serialize drinks data
            drink_schema = DrinkSchema(many=True)
            serialized_drinks = drink_schema.dump(drinks_data)
            
            logger.debug(f"Serialized drinks: {len(serialized_drinks)} drinks")
            
            response = {
                'success': True,
                'data': serialized_drinks,
                'metadata': {
                    'total_count': len(serialized_drinks),
                    'last_updated': metadata.get('last_updated'),
                    'version': metadata.get('version')
                }
            }
            
            logger.info(f"Retrieved {len(serialized_drinks)} drinks")
            return response, 200
            
        except Exception as e:
            logger.error(f"Failed to get drinks list: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve drinks list',
                'message': str(e)
            }, 500
    
    def post(self):
        """
        Create a new drink.
        
        Request Body:
            {
                "name": "Beer Name",
                "minimum_price": "4.00",
                "price_step_size": "0.50",
                "current_price": "4.00"  // Optional, defaults to minimum_price
            }
            
        Returns:
            JSON: Created drink data with assigned ID
        """
        try:
            if not request.is_json:
                return {
                    'success': False,
                    'error': 'Content-Type must be application/json'
                }, 400
            
            # Validate input data
            create_schema = DrinkCreateSchema()
            try:
                validated_data = create_schema.load(request.json)
            except ValidationError as e:
                return {
                    'success': False,
                    'error': 'Validation failed',
                    'details': e.messages
                }, 400
            
            data_manager = current_app.data_manager
            current_drinks = data_manager.get_drinks()
            
            # Assign new ID
            if current_drinks:
                max_id = max(drink['id'] for drink in current_drinks)
                validated_data['id'] = max_id + 1
            else:
                validated_data['id'] = 1
            
            # Assign list position if not provided
            if validated_data.get('list_position') is None:
                validated_data['list_position'] = len(current_drinks) + 1
            
            # Add new drink to list
            updated_drinks = current_drinks + [validated_data]
            
            # Update data manager
            success = data_manager.update_drinks(updated_drinks)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to create drink'
                }, 500
            
            # Return created drink
            drink_schema = DrinkSchema()
            serialized_drink = drink_schema.dump(validated_data)
            
            logger.info(f"Created new drink: {validated_data['name']} (ID: {validated_data['id']})")
            return {
                'success': True,
                'data': serialized_drink,
                'message': f"Drink '{validated_data['name']}' created successfully"
            }, 201
            
        except DataValidationError as e:
            logger.warning(f"Drink creation validation failed: {e}")
            return {
                'success': False,
                'error': 'Data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to create drink: {e}")
            return {
                'success': False,
                'error': 'Failed to create drink',
                'message': str(e)
            }, 500


class DrinkDetail(Resource):
    """API endpoint for individual drink operations."""
    
    def get(self, drink_id):
        """
        Get specific drink details.
        
        Args:
            drink_id (int): ID of the drink to retrieve
            
        Returns:
            JSON: Drink data or error message
        """
        try:
            drink_id = int(drink_id)
        except ValueError:
            return {
                'success': False,
                'error': 'Invalid drink ID format'
            }, 400
        
        try:
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            
            # Find drink by ID
            drink = next((d for d in drinks_data if d['id'] == drink_id), None)
            if not drink:
                return {
                    'success': False,
                    'error': 'Drink not found',
                    'message': f'No drink found with ID {drink_id}'
                }, 404
            
            # Serialize drink data
            drink_schema = DrinkSchema()
            serialized_drink = drink_schema.dump(drink)
            
            logger.info(f"Retrieved drink ID {drink_id}: {drink['name']}")
            return {
                'success': True,
                'data': serialized_drink
            }, 200
            
        except Exception as e:
            logger.error(f"Failed to get drink {drink_id}: {e}")
            return {
                'success': False,
                'error': 'Failed to retrieve drink',
                'message': str(e)
            }, 500
    
    def put(self, drink_id):
        """
        Update drink details.
        
        Args:
            drink_id (int): ID of the drink to update
            
        Request Body:
            {
                "name": "New Name",           // Optional
                "minimum_price": "4.50",     // Optional
                "current_price": "5.00",     // Optional
                "price_step_size": "0.25",   // Optional
                "trend": "increasing"        // Optional
            }
            
        Returns:
            JSON: Updated drink data or error message
        """
        try:
            drink_id = int(drink_id)
        except ValueError:
            return {
                'success': False,
                'error': 'Invalid drink ID format'
            }, 400
        
        try:
            if not request.is_json:
                return {
                    'success': False,
                    'error': 'Content-Type must be application/json'
                }, 400
            
            # Validate input data
            update_schema = DrinkUpdateSchema()
            try:
                validated_data = update_schema.load(request.json)
            except ValidationError as e:
                return {
                    'success': False,
                    'error': 'Validation failed',
                    'details': e.messages
                }, 400
            
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            
            # Find drink by ID
            drink_index = next((i for i, d in enumerate(drinks_data) if d['id'] == drink_id), None)
            if drink_index is None:
                return {
                    'success': False,
                    'error': 'Drink not found',
                    'message': f'No drink found with ID {drink_id}'
                }, 404
            
            # Update drink data
            updated_drink = drinks_data[drink_index].copy()
            updated_drink.update(validated_data)
            
            # Replace in drinks list
            updated_drinks = drinks_data.copy()
            updated_drinks[drink_index] = updated_drink
            
            # Update data manager
            success = data_manager.update_drinks(updated_drinks)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to update drink'
                }, 500
            
            # Return updated drink
            drink_schema = DrinkSchema()
            serialized_drink = drink_schema.dump(updated_drink)
            
            logger.info(f"Updated drink ID {drink_id}: {updated_drink['name']}")
            return {
                'success': True,
                'data': serialized_drink,
                'message': f"Drink '{updated_drink['name']}' updated successfully"
            }, 200
            
        except DataValidationError as e:
            logger.warning(f"Drink update validation failed: {e}")
            return {
                'success': False,
                'error': 'Data validation failed',
                'message': str(e)
            }, 400
        except Exception as e:
            logger.error(f"Failed to update drink {drink_id}: {e}")
            return {
                'success': False,
                'error': 'Failed to update drink',
                'message': str(e)
            }, 500
    
    def delete(self, drink_id):
        """
        Delete a drink.
        
        Args:
            drink_id (int): ID of the drink to delete
            
        Returns:
            JSON: Success message or error
        """
        try:
            drink_id = int(drink_id)
        except ValueError:
            return {
                'success': False,
                'error': 'Invalid drink ID format'
            }, 400
        
        try:
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            
            # Find drink by ID
            drink_index = next((i for i, d in enumerate(drinks_data) if d['id'] == drink_id), None)
            if drink_index is None:
                return {
                    'success': False,
                    'error': 'Drink not found',
                    'message': f'No drink found with ID {drink_id}'
                }, 404
            
            drink_name = drinks_data[drink_index]['name']
            
            # Remove drink from list
            updated_drinks = [d for d in drinks_data if d['id'] != drink_id]
            
            # Update data manager
            success = data_manager.update_drinks(updated_drinks)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to delete drink'
                }, 500
            
            logger.info(f"Deleted drink ID {drink_id}: {drink_name}")
            return {
                'success': True,
                'message': f"Drink '{drink_name}' deleted successfully"
            }, 200  # Using 200 instead of 204 to include response body
            
        except Exception as e:
            logger.error(f"Failed to delete drink {drink_id}: {e}")
            return {
                'success': False,
                'error': 'Failed to delete drink',
                'message': str(e)
            }, 500


class DrinkSales(Resource):
    """API endpoint for recording drink sales."""
    
    def post(self, drink_id):
        """
        Record a sale for the specified drink.
        
        Args:
            drink_id (int): ID of the drink sold
            
        Request Body:
            {
                "quantity": 1      // Optional, defaults to 1
            }
            
        Returns:
            JSON: Updated drink data with new sales count
        """
        try:
            drink_id = int(drink_id)
        except ValueError:
            return {
                'success': False,
                'error': 'Invalid drink ID format'
            }, 400
        
        try:
            # Validate input data
            sales_schema = DrinkSalesSchema()
            validated_data = {'drink_id': drink_id}
            
            if request.is_json and request.json:
                try:
                    sale_data = sales_schema.load(request.json)
                    validated_data.update(sale_data)
                except ValidationError as e:
                    return {
                        'success': False,
                        'error': 'Validation failed',
                        'details': e.messages
                    }, 400
            
            quantity = validated_data.get('quantity', 1)
            
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            
            # Find drink by ID
            drink_index = next((i for i, d in enumerate(drinks_data) if d['id'] == drink_id), None)
            if drink_index is None:
                return {
                    'success': False,
                    'error': 'Drink not found',
                    'message': f'No drink found with ID {drink_id}'
                }, 404
            
            # Update sales count
            updated_drink = drinks_data[drink_index].copy()
            current_sales = updated_drink.get('sales_count', 0)
            updated_drink['sales_count'] = current_sales + quantity
            
            # Replace in drinks list
            updated_drinks = drinks_data.copy()
            updated_drinks[drink_index] = updated_drink
            
            # Update data manager
            success = data_manager.update_drinks(updated_drinks)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to record sale'
                }, 500
            
            # Return updated drink
            drink_schema = DrinkSchema()
            serialized_drink = drink_schema.dump(updated_drink)
            
            logger.info(f"Recorded sale for drink ID {drink_id}: {updated_drink['name']} (quantity: {quantity}, total sales: {updated_drink['sales_count']})")
            return {
                'success': True,
                'data': serialized_drink,
                'message': f"Sale recorded for '{updated_drink['name']}' (quantity: {quantity})"
            }, 201
            
        except Exception as e:
            logger.error(f"Failed to record sale for drink {drink_id}: {e}")
            return {
                'success': False,
                'error': 'Failed to record sale',
                'message': str(e)
            }, 500


class DrinkReorder(Resource):
    """API endpoint for reordering the drink list."""
    
    def put(self):
        """
        Reorder drinks in the display list.
        
        Request Body:
            {
                "drinks": [
                    {"id": 1, "list_position": 3},
                    {"id": 2, "list_position": 1},
                    {"id": 3, "list_position": 2}
                ]
            }
            
        Returns:
            JSON: Success message with updated drinks
        """
        try:
            if not request.is_json:
                return {
                    'success': False,
                    'error': 'Content-Type must be application/json'
                }, 400
            
            from api.validators.drink_schema import DrinkListReorderSchema
            
            # Validate input data
            reorder_schema = DrinkListReorderSchema()
            try:
                validated_data = reorder_schema.load(request.json)
            except ValidationError as e:
                return {
                    'success': False,
                    'error': 'Validation failed',
                    'details': e.messages
                }, 400
            
            data_manager = current_app.data_manager
            drinks_data = data_manager.get_drinks()
            
            # Create position update map
            position_updates = {item['id']: item['list_position'] for item in validated_data['drinks']}
            
            # Validate all drink IDs exist
            existing_ids = {drink['id'] for drink in drinks_data}
            requested_ids = set(position_updates.keys())
            
            if not requested_ids.issubset(existing_ids):
                missing_ids = requested_ids - existing_ids
                return {
                    'success': False,
                    'error': 'Invalid drink IDs',
                    'message': f'Drinks not found: {list(missing_ids)}'
                }, 400
            
            # Update positions
            updated_drinks = []
            for drink in drinks_data:
                updated_drink = drink.copy()
                if drink['id'] in position_updates:
                    updated_drink['list_position'] = position_updates[drink['id']]
                updated_drinks.append(updated_drink)
            
            # Sort by new positions
            updated_drinks.sort(key=lambda x: x['list_position'])
            
            # Update data manager
            success = data_manager.update_drinks(updated_drinks)
            if not success:
                return {
                    'success': False,
                    'error': 'Failed to reorder drinks'
                }, 500
            
            # Return updated drinks
            drink_schema = DrinkSchema(many=True)
            serialized_drinks = drink_schema.dump(updated_drinks)
            
            logger.info(f"Reordered {len(position_updates)} drinks")
            return {
                'success': True,
                'data': serialized_drinks,
                'message': f"Successfully reordered {len(position_updates)} drinks"
            }, 200
            
        except Exception as e:
            logger.error(f"Failed to reorder drinks: {e}")
            return {
                'success': False,
                'error': 'Failed to reorder drinks',
                'message': str(e)
            }, 500