"""
Map placement bounds (world coordinates). Must match frontend inventoryBounds.room defaults.
"""
# Same as milventory InventoryContext default room rect
ROOM_X = 80
ROOM_Y = 80
ROOM_WIDTH = 3600
ROOM_HEIGHT = 3840


def coords_in_room(x, y):
    """True if integer coords lie inside the closed room rectangle."""
    try:
        xi = int(round(float(x)))
        yi = int(round(float(y)))
    except (TypeError, ValueError):
        return False
    if xi < ROOM_X or yi < ROOM_Y:
        return False
    if xi > ROOM_X + ROOM_WIDTH or yi > ROOM_Y + ROOM_HEIGHT:
        return False
    return True


def clamp_coords_to_room(x, y):
    """Return (int, int) clamped to room bounds."""
    try:
        xf = float(x)
        yf = float(y)
    except (TypeError, ValueError):
        xf = float(ROOM_X)
        yf = float(ROOM_Y)
    xi = int(round(max(ROOM_X, min(ROOM_X + ROOM_WIDTH, xf))))
    yi = int(round(max(ROOM_Y, min(ROOM_Y + ROOM_HEIGHT, yf))))
    return xi, yi
