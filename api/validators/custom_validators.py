"""
Abbey Stock Exchange v5 - Custom Validators

Custom validation functions for business rules and complex validation logic
that extends beyond basic Marshmallow field validation.
"""

from marshmallow import ValidationError
from decimal import Decimal
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any


class BusinessRuleValidator:
    """
    Collection of custom validators for Abbey Stock Exchange business rules.
    
    Implements complex validation logic that spans multiple fields or
    requires business context to validate properly.
    """
    
    @staticmethod
    def validate_price_algorithm_constraints(drinks_data: List[Dict[str, Any]]) -> List[str]:
        """
        Validate that drink data follows price algorithm constraints.
        
        Business Rules:
        - Current price must be >= minimum price
        - Price step size must allow meaningful price changes
        - List positions must be unique and sequential
        
        Args:
            drinks_data: List of drink dictionaries
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        # Check for duplicate list positions
        positions = [drink.get('list_position') for drink in drinks_data if drink.get('list_position')]
        if len(positions) != len(set(positions)):
            errors.append("Duplicate list positions found - each drink must have a unique position")
        
        # Validate each drink
        for i, drink in enumerate(drinks_data):
            drink_id = drink.get('id', f'drink_{i}')
            
            # Price constraints
            current_price = drink.get('current_price')
            minimum_price = drink.get('minimum_price')
            
            if current_price is not None and minimum_price is not None:
                if current_price < minimum_price:
                    errors.append(f"Drink {drink_id}: Current price (${current_price}) is below minimum price (${minimum_price})")
            
            # Price step validation
            price_step = drink.get('price_step_size')
            if price_step is not None and minimum_price is not None:
                if price_step > minimum_price:
                    errors.append(f"Drink {drink_id}: Price step size (${price_step}) is larger than minimum price (${minimum_price})")
        
        return errors
    
    @staticmethod
    def validate_refresh_cycle_compatibility(refresh_cycle: int, drinks_count: int) -> List[str]:
        """
        Validate refresh cycle compatibility with system load.
        
        Args:
            refresh_cycle: Refresh cycle in seconds
            drinks_count: Number of drinks in the system
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        # Performance validation
        if drinks_count > 20 and refresh_cycle < 120:
            errors.append("Refresh cycle should be at least 2 minutes with more than 20 drinks for optimal performance")
        
        if drinks_count > 50 and refresh_cycle < 300:
            errors.append("Refresh cycle should be at least 5 minutes with more than 50 drinks")
        
        # WebSocket update frequency validation
        updates_per_hour = 3600 / refresh_cycle
        if updates_per_hour > 120:
            errors.append("Refresh cycle creates more than 120 updates per hour - may impact performance")
        elif updates_per_hour > 60:
            # Log warning but don't prevent operation
            import logging
            logger = logging.getLogger('abbey.validators')
            logger.warning(f"High refresh frequency: {updates_per_hour:.1f} updates/hour may impact performance on low-powered devices")
        
        return errors
    
    @staticmethod
    def validate_backup_integrity(backup_data: Dict[str, Any]) -> List[str]:
        """
        Validate backup file integrity and completeness.
        
        Args:
            backup_data: Backup file data dictionary
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        # Required sections
        if 'settings' not in backup_data:
            errors.append("Backup missing required 'settings' section")
        
        if 'drinks' not in backup_data:
            errors.append("Backup missing required 'drinks' section")
        
        # Settings validation
        settings = backup_data.get('settings', {})
        if 'refresh_cycle' not in settings:
            errors.append("Backup settings missing required 'refresh_cycle'")
        
        # Drinks validation
        drinks = backup_data.get('drinks', [])
        if len(drinks) == 0:
            errors.append("Backup contains no drinks - system requires at least one drink")
        
        # Cross-reference validation
        if settings and drinks:
            refresh_cycle = settings.get('refresh_cycle')
            if refresh_cycle:
                cycle_errors = BusinessRuleValidator.validate_refresh_cycle_compatibility(
                    refresh_cycle, len(drinks)
                )
                errors.extend(cycle_errors)
        
        return errors
    
    @staticmethod
    def validate_drink_name_uniqueness(drinks_data: List[Dict[str, Any]], exclude_id: int = None) -> List[str]:
        """
        Validate that drink names are unique within the system.
        
        Args:
            drinks_data: List of drink dictionaries
            exclude_id: Drink ID to exclude from validation (for updates)
            
        Returns:
            List of validation error messages
        """
        errors = []
        names = []
        
        for drink in drinks_data:
            drink_id = drink.get('id')
            name = drink.get('name', '').strip().lower()
            
            # Skip excluded drink (for updates)
            if exclude_id and drink_id == exclude_id:
                continue
            
            if name in names:
                errors.append(f"Duplicate drink name found: '{drink.get('name')}'")
            else:
                names.append(name)
        
        return errors
    
    @staticmethod
    def validate_system_limits(data: Dict[str, Any]) -> List[str]:
        """
        Validate system-wide limits and constraints.
        
        Args:
            data: System data including drinks, settings, etc.
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        drinks = data.get('drinks', [])
        settings = data.get('settings', {})
        
        # Drink count limits
        if len(drinks) > 50:
            errors.append("System supports maximum 50 drinks")
        
        # Memory usage estimation
        estimated_memory_mb = len(drinks) * 0.1  # Rough estimate
        if estimated_memory_mb > 10:  # 10MB limit for Raspberry Pi
            errors.append("Estimated memory usage exceeds Raspberry Pi limits")
        
        # Concurrent user limits
        max_users = settings.get('max_concurrent_users', 10)
        if max_users > 20:
            errors.append("Maximum concurrent users should not exceed 20 on Raspberry Pi")
        
        return errors


class PriceValidator:
    """
    Specialized validators for price-related business rules.
    """
    
    @staticmethod
    def validate_price_step_effectiveness(minimum_price: Decimal, price_step: Decimal, max_cycles: int = 20) -> List[str]:
        """
        Validate that price step size allows for meaningful price changes.
        
        Args:
            minimum_price: Minimum price for the drink
            price_step: Price step size
            max_cycles: Maximum cycles to simulate
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        # Calculate maximum price after growth cycles
        max_possible_price = minimum_price + (price_step * max_cycles)
        
        if max_possible_price > Decimal('999.99'):
            errors.append(f"Price step size too large - would exceed maximum price after {max_cycles} cycles")
        
        # Check for reasonable price ranges
        price_range = max_possible_price - minimum_price
        if price_range < minimum_price * Decimal('0.5'):
            errors.append("Price step size may be too small for meaningful price variation")
        
        return errors
    
    @staticmethod
    def validate_trend_consistency(current_price: Decimal, previous_price: Decimal, trend: str) -> List[str]:
        """
        Validate that price trend matches actual price changes.
        
        Args:
            current_price: Current drink price
            previous_price: Previous drink price
            trend: Reported trend ('increasing', 'stable', 'decreasing')
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        price_diff = current_price - previous_price
        
        if trend == 'increasing' and price_diff <= 0:
            errors.append("Trend marked as 'increasing' but price did not increase")
        elif trend == 'decreasing' and price_diff >= 0:
            errors.append("Trend marked as 'decreasing' but price did not decrease")
        elif trend == 'stable' and price_diff != 0:
            errors.append("Trend marked as 'stable' but price changed")
        
        return errors


class FileValidator:
    """
    Validators for file operations and naming conventions.
    """
    
    @staticmethod
    def validate_backup_filename(filename: str) -> List[str]:
        """
        Validate backup filename follows required format.
        
        Args:
            filename: Backup filename to validate
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        # Check format
        pattern = r'^\d{4}-\d{2}-\d{2}-backup\.yaml$'
        if not re.match(pattern, filename):
            errors.append("Backup filename must follow format: YYYY-MM-DD-backup.yaml")
            return errors
        
        # Validate date part
        try:
            date_part = filename.split('-backup.yaml')[0]
            backup_date = datetime.strptime(date_part, '%Y-%m-%d')
            
            # Check if date is reasonable (not too far in future/past)
            today = datetime.now().date()
            if backup_date.date() > today + timedelta(days=1):
                errors.append("Backup date cannot be in the future")
            
            if backup_date.date() < today - timedelta(days=365 * 5):
                errors.append("Backup date cannot be more than 5 years in the past")
                
        except ValueError:
            errors.append("Backup filename contains invalid date")
        
        return errors