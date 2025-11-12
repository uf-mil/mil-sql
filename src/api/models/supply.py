"""
Supply data model.
"""
from dataclasses import dataclass
from typing import Optional
from datetime import date


@dataclass
class Supply:
    """Supply inventory entry model."""
    id: Optional[int] = None
    name: str = ""
    amount: int = 0
    last_order_date: Optional[date] = None
    location: str = ""
    
    @classmethod
    def from_db_row(cls, row):
        """Create Supply from database row tuple.
        
        Args:
            row: Tuple from database query (id, name, amount, last_order_date, location)
        """
        return cls(
            id=row[0],
            name=row[1],
            amount=row[2],
            last_order_date=row[3],
            location=row[4]
        )
    
    @classmethod
    def from_dict(cls, data: dict):
        """Create Supply from dictionary.
        
        Args:
            data: Dictionary with supply fields
        """
        return cls(
            id=data.get('id'),
            name=data.get('name', ''),
            amount=data.get('amount', 0),
            last_order_date=data.get('last_order_date'),
            location=data.get('location', '')
        )
    
    def to_dict(self):
        """Convert Supply to dictionary."""
        result = {
            'id': self.id,
            'name': self.name,
            'amount': self.amount,
            'location': self.location
        }
        if self.last_order_date:
            result['last_order_date'] = self.last_order_date.isoformat() if hasattr(self.last_order_date, 'isoformat') else str(self.last_order_date)
        return result

