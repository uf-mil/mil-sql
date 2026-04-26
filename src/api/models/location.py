"""
Location model for API responses.
"""
from dataclasses import dataclass
from typing import Optional, Dict, Any


@dataclass
class Location:
    """Location model representing a storage location."""
    name: str
    x: int
    y: int
    width: int
    height: int
    type: str
    shelf_count: int = 0
    protected: bool = False

    @classmethod
    def from_db_row(cls, row: tuple) -> 'Location':
        """
        Create Location from a database row.

        Expected column order:
            (name, x, y, width, height, type, shelf_count, protected)

        For backward compatibility we also accept the legacy 7-column row
        (without shelf_count) by defaulting shelf_count to 0.
        """
        if len(row) >= 8:
            return cls(
                name=row[0],
                x=row[1],
                y=row[2],
                width=row[3],
                height=row[4],
                type=row[5],
                shelf_count=int(row[6] or 0),
                protected=bool(row[7]),
            )
        # legacy 7-column: (name, x, y, width, height, type, protected)
        return cls(
            name=row[0],
            x=row[1],
            y=row[2],
            width=row[3],
            height=row[4],
            type=row[5],
            shelf_count=0,
            protected=bool(row[6]) if len(row) > 6 else False,
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            'name': self.name,
            'x': self.x,
            'y': self.y,
            'width': self.width,
            'height': self.height,
            'type': self.type,
            'shelf_count': self.shelf_count,
            'protected': self.protected,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Location':
        return cls(
            name=data['name'],
            x=int(data['x']),
            y=int(data['y']),
            width=int(data['width']),
            height=int(data['height']),
            type=data['type'],
            shelf_count=int(data.get('shelf_count', 0) or 0),
            protected=bool(data.get('protected', False)),
        )
