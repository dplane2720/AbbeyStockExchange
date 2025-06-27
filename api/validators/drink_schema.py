"""
Abbey Stock Exchange v5 - Drink Validation Schemas

Marshmallow schemas for drink data validation, serialization, and deserialization.
Implements all business rules for drink data as specified in PROJECT_MASTER.md.
"""

from marshmallow import Schema, fields, validate, validates, validates_schema, ValidationError, post_load, post_dump, EXCLUDE
from decimal import Decimal, ROUND_HALF_UP


class DrinkSchema(Schema):
    """
    Complete drink schema for serialization and validation.
    
    Implements the data schema requirements from PROJECT_MASTER.md:
    - Drink Name: Display name for the menu item
    - Minimum Price: Lowest price the item can reach (price floor)
    - Current Price: Present selling price of the item
    - Price Step Size: Amount price increases/decreases each refresh cycle
    - List Position: Order position within the drink list
    - Trend: Current price trend (increasing/stable/decreasing)
    """
    
    id = fields.Integer(required=True, validate=validate.Range(min=1))
    
    name = fields.String(
        required=True,
        validate=[
            validate.Length(min=1, max=50, error="Drink name must be 1-50 characters"),
            validate.Regexp(
                r'^[a-zA-Z0-9\s\-\'&.,!]+$',
                error="Drink name contains invalid characters"
            )
        ]
    )
    
    minimum_price = fields.Decimal(
        required=True,
        validate=validate.Range(
            min=Decimal('0.00'),
            max=Decimal('999.99'),
            error="Minimum price must be between $0.00 and $999.99"
        ),
        places=2
    )
    
    current_price = fields.Decimal(
        required=True,
        validate=validate.Range(
            min=Decimal('0.00'),
            max=Decimal('999.99'),
            error="Current price must be between $0.00 and $999.99"
        ),
        places=2
    )
    
    price_step_size = fields.Decimal(
        required=True,
        validate=validate.Range(
            min=Decimal('0.01'),
            max=Decimal('99.99'),
            error="Price step size must be between $0.01 and $99.99"
        ),
        places=2
    )
    
    list_position = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=100,
            error="List position must be between 1 and 100"
        )
    )
    
    trend = fields.String(
        required=True,
        validate=validate.OneOf(
            ['increasing', 'stable', 'decreasing'],
            error="Trend must be 'increasing', 'stable', or 'decreasing'"
        )
    )
    
    # Additional fields for tracking
    sales_count = fields.Integer(
        load_default=0,
        validate=validate.Range(
            min=0,
            error="Sales count cannot be negative"
        )
    )
    
    last_updated = fields.DateTime(dump_only=True)
    
    @validates_schema
    def validate_price_constraints(self, data, **kwargs):
        """
        Validate that current price is not below minimum price.
        Business rule: Current Price must be >= Minimum Price
        """
        current_price = data.get('current_price')
        minimum_price = data.get('minimum_price')
        
        if current_price is not None and minimum_price is not None:
            if current_price < minimum_price:
                raise ValidationError(
                    "Current price cannot be below minimum price",
                    field_name='current_price'
                )
    
    @validates('name')
    def validate_name_not_empty(self, value):
        """Ensure drink name is not just whitespace."""
        if not value or not value.strip():
            raise ValidationError("Drink name cannot be empty or just whitespace")
    
    @post_load
    def round_prices(self, data, **kwargs):
        """Round all price values to 2 decimal places."""
        price_fields = ['minimum_price', 'current_price', 'price_step_size']
        
        for field in price_fields:
            if field in data and data[field] is not None:
                data[field] = data[field].quantize(
                    Decimal('0.01'),
                    rounding=ROUND_HALF_UP
                )
        
        return data
    
    @post_dump
    def convert_decimals_to_floats(self, data, **kwargs):
        """Convert Decimal objects to floats for JSON serialization."""
        decimal_fields = ['minimum_price', 'current_price', 'price_step_size']
        
        for field in decimal_fields:
            if field in data and isinstance(data[field], Decimal):
                data[field] = float(data[field])
        
        return data


class DrinkCreateSchema(DrinkSchema):
    """
    Schema for creating new drinks.
    Excludes fields that are auto-generated or not required for creation.
    """
    
    # Remove required fields that are auto-generated
    id = fields.Integer(dump_only=True)
    trend = fields.String(load_default='stable')  # Default trend for new drinks
    sales_count = fields.Integer(load_default=0)
    last_updated = fields.DateTime(dump_only=True)
    
    # Make current_price optional - will default to minimum_price
    current_price = fields.Decimal(
        required=False,
        validate=validate.Range(
            min=Decimal('0.00'),
            max=Decimal('999.99'),
            error="Current price must be between $0.00 and $999.99"
        ),
        places=2
    )
    
    # Make list_position optional - will be auto-assigned if not provided
    list_position = fields.Integer(
        load_default=None,
        allow_none=True,
        validate=validate.Range(
            min=1,
            max=100,
            error="List position must be between 1 and 100"
        )
    )
    
    @post_load
    def set_current_price_default(self, data, **kwargs):
        """
        Set current_price to minimum_price if not provided.
        Business rule: New drinks start at their minimum price.
        """
        data = super().round_prices(data, **kwargs)
        
        if 'current_price' not in data and 'minimum_price' in data:
            data['current_price'] = data['minimum_price']
        
        return data


class DrinkUpdateSchema(DrinkSchema):
    """
    Schema for updating existing drinks.
    Makes most fields optional for partial updates.
    """
    
    class Meta:
        unknown = EXCLUDE  # Ignore unknown fields instead of raising errors
    
    # Make fields optional for updates
    name = fields.String(
        required=False,
        validate=[
            validate.Length(min=1, max=50, error="Drink name must be 1-50 characters"),
            validate.Regexp(
                r'^[a-zA-Z0-9\s\-\'&.,!]+$',
                error="Drink name contains invalid characters"
            )
        ]
    )
    
    minimum_price = fields.Decimal(
        required=False,
        validate=validate.Range(
            min=Decimal('0.00'),
            max=Decimal('999.99'),
            error="Minimum price must be between $0.00 and $999.99"
        ),
        places=2
    )
    
    current_price = fields.Decimal(
        required=False,
        validate=validate.Range(
            min=Decimal('0.00'),
            max=Decimal('999.99'),
            error="Current price must be between $0.00 and $999.99"
        ),
        places=2
    )
    
    price_step_size = fields.Decimal(
        required=False,
        validate=validate.Range(
            min=Decimal('0.01'),
            max=Decimal('99.99'),
            error="Price step size must be between $0.01 and $99.99"
        ),
        places=2
    )
    
    list_position = fields.Integer(
        required=False,
        validate=validate.Range(
            min=1,
            max=100,
            error="List position must be between 1 and 100"
        )
    )
    
    trend = fields.String(
        required=False,
        validate=validate.OneOf(
            ['increasing', 'stable', 'decreasing'],
            error="Trend must be 'increasing', 'stable', or 'decreasing'"
        )
    )
    
    # Don't allow updating these fields directly
    id = fields.Integer(dump_only=True)
    sales_count = fields.Integer(dump_only=True)
    last_updated = fields.DateTime(dump_only=True)


class DrinkSalesSchema(Schema):
    """
    Schema for recording drink sales.
    Simple schema for sales recording operations.
    """
    
    drink_id = fields.Integer(
        required=True,
        validate=validate.Range(min=1, error="Drink ID must be positive")
    )
    
    quantity = fields.Integer(
        load_default=1,
        validate=validate.Range(
            min=1,
            max=10,
            error="Quantity must be between 1 and 10"
        )
    )
    
    timestamp = fields.DateTime(dump_only=True)


class DrinkListReorderSchema(Schema):
    """
    Schema for reordering the drink list.
    Used for batch position updates.
    """
    
    drinks = fields.List(
        fields.Nested(lambda: DrinkPositionSchema()),
        required=True,
        validate=validate.Length(min=1, error="At least one drink must be provided")
    )


class DrinkPositionSchema(Schema):
    """
    Schema for individual drink position updates.
    """
    
    id = fields.Integer(
        required=True,
        validate=validate.Range(min=1, error="Drink ID must be positive")
    )
    
    list_position = fields.Integer(
        required=True,
        validate=validate.Range(
            min=1,
            max=100,
            error="List position must be between 1 and 100"
        )
    )