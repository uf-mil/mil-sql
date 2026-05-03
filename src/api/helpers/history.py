"""
History tracking helper functions for supplies.
"""
import sys
import uuid
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.api.db import get_db


def log_supply_history(conn, supply_id, action_type, old_values, new_values, changed_by):
    """
    Log a history entry for a supply change.
    
    Args:
        conn: Database connection
        supply_id: Supply ID (can be None for CREATE before insert)
        action_type: 'CREATE', 'UPDATE', or 'DELETE'
        old_values: Dict with old_name, old_description, old_image, old_last_order_date
        new_values: Dict with new_name, new_description, new_image, new_last_order_date
        changed_by: UF ID of user making the change
    
    Returns:
        History entry ID
    """
    cur = conn.cursor()
    
    try:
        cur.execute("""
            INSERT INTO supplies_history (
                supply_id, action_type,
                old_name, new_name,
                old_description, new_description,
                old_image, new_image,
                old_last_order_date, new_last_order_date,
                changed_by
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            supply_id,
            action_type,
            old_values.get('name'),
            new_values.get('name'),
            old_values.get('description'),
            new_values.get('description'),
            old_values.get('image'),
            new_values.get('image'),
            old_values.get('last_order_date'),
            new_values.get('last_order_date'),
            changed_by
        ))
        
        history_id = cur.lastrowid
        return history_id
    finally:
        cur.close()


def log_team_changes(conn, history_id, old_teams, new_teams):
    """
    Log team changes for a history entry.
    
    Args:
        conn: Database connection
        history_id: History entry ID
        old_teams: List of old team names
        new_teams: List of new team names
    """
    cur = conn.cursor()
    
    try:
        old_set = set(old_teams or [])
        new_set = set(new_teams or [])
        
        # Teams that were removed
        removed = old_set - new_set
        for team_name in removed:
            cur.execute("""
                INSERT INTO supplies_history_teams (history_id, team_name, action)
                VALUES (%s, %s, 'REMOVED')
            """, (history_id, team_name))
        
        # Teams that were added
        added = new_set - old_set
        for team_name in added:
            cur.execute("""
                INSERT INTO supplies_history_teams (history_id, team_name, action)
                VALUES (%s, %s, 'ADDED')
            """, (history_id, team_name))
    finally:
        cur.close()


def log_category_changes(conn, history_id, old_categories, new_categories):
    """
    Log category changes for a history entry.
    
    Args:
        conn: Database connection
        history_id: History entry ID
        old_categories: List of old category IDs
        new_categories: List of new category IDs
    """
    cur = conn.cursor()
    
    try:
        old_set = set(old_categories or [])
        new_set = set(new_categories or [])
        
        # Categories that were removed
        removed = old_set - new_set
        for category_id in removed:
            cur.execute("""
                INSERT INTO supplies_history_categories (history_id, category_id, action)
                VALUES (%s, %s, 'REMOVED')
            """, (history_id, category_id))
        
        # Categories that were added
        added = new_set - old_set
        for category_id in added:
            cur.execute("""
                INSERT INTO supplies_history_categories (history_id, category_id, action)
                VALUES (%s, %s, 'ADDED')
            """, (history_id, category_id))
    finally:
        cur.close()


def get_supply_current_state(conn, supply_id):
    """
    Get current state of a supply including teams and categories.
    
    Args:
        conn: Database connection
        supply_id: Supply ID
    
    Returns:
        Dict with supply data, teams, and categories
    """
    cur = conn.cursor(dictionary=True)
    
    try:
        # Get supply
        cur.execute("""
            SELECT id, name, description, image, last_order_date
            FROM supplies WHERE id = %s
        """, (supply_id,))
        supply = cur.fetchone()
        
        if not supply:
            return None
        
        # Get teams
        cur.execute("""
            SELECT team_name FROM supplies_teams WHERE supply_id = %s
        """, (supply_id,))
        teams = [row['team_name'] for row in cur.fetchall()]
        
        # Get categories
        cur.execute("""
            SELECT category_id FROM supplies_categories WHERE supply_id = %s
        """, (supply_id,))
        categories = [row['category_id'] for row in cur.fetchall()]
        
        return {
            'name': supply['name'],
            'description': supply['description'],
            'image': supply['image'],
            'last_order_date': supply['last_order_date'],
            'teams': teams,
            'categories': categories
        }
    finally:
        cur.close()


def log_location_history(conn, action_type, supply_id, supply_name,
                         location_name, shelf,
                         old_amount, new_amount,
                         changed_by,
                         related_location=None, related_shelf=None,
                         batch_id=None):
    """
    Insert one row into supplies_location_history.
    Pass batch_id from the caller to group related rows.
    Returns the inserted row id.
    
    Args:
        conn: Database connection
        action_type: 'ADD', 'REMOVE', 'UPDATE', 'MOVE', or 'CASCADED_SUBTRACT'
        supply_id: Supply ID (can be None)
        supply_name: Supply name (denormalized, required)
        location_name: Location name
        shelf: Shelf number (can be None)
        old_amount: Amount before change (None for ADD)
        new_amount: Amount after change (None for REMOVE/SNAPSHOT)
        changed_by: UF ID of user making the change
        related_location: For MOVE actions, the other location
        related_shelf: For MOVE actions, the other shelf
        batch_id: UUID string to group related operations
    
    Returns:
        History entry ID
    """
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO supplies_location_history
                (supply_id, supply_name, location_name, shelf,
                 action_type, old_amount, new_amount,
                 related_location, related_shelf,
                 batch_id, changed_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            supply_id, supply_name, location_name, shelf,
            action_type, old_amount, new_amount,
            related_location, related_shelf,
            batch_id, changed_by
        ))
        return cur.lastrowid
    finally:
        cur.close()


def snapshot_supply_locations_before_delete(conn, supply_id, supply_name, changed_by):
    """
    Called BEFORE deleting a supply. Reads all current supplies_location rows
    for this supply and writes CASCADED_SUBTRACT history entries.
    These are later used to restore the supply's full location state.
    batch_id ties all snapshots from the same delete together.
    
    Args:
        conn: Database connection
        supply_id: Supply ID to snapshot
        supply_name: Supply name (denormalized)
        changed_by: UF ID of user making the change
    
    Returns:
        batch_id (UUID string) that groups all snapshot rows
    """
    cur = conn.cursor(dictionary=True)
    batch_id = str(uuid.uuid4())
    try:
        cur.execute("""
            SELECT location_name, shelf, amount, coord_x, coord_y
            FROM supplies_location
            WHERE supply_id = %s
        """, (supply_id,))
        rows = cur.fetchall()
        for row in rows:
            is_free = row['location_name'] is None and row.get('coord_x') is not None
            log_location_history(
                conn,
                action_type='CASCADED_SUBTRACT',
                supply_id=supply_id,
                supply_name=supply_name,
                location_name='Free Coordinate' if is_free else row['location_name'],
                shelf=row['shelf'],
                old_amount=row['amount'],
                new_amount=None,
                changed_by=changed_by,
                batch_id=batch_id,
                related_location=f"{row['coord_x']},{row['coord_y']}" if is_free else None,
            )
        return batch_id   # return so caller can attach to the supplies_history row too
    finally:
        cur.close()


def is_latest_global_history_timestamp(cur, changed_at):
    """
    True if changed_at equals the latest timestamp across location + supply history.
    Non-leaders may only undo that row; leaders skip this check in routes.
    """
    if changed_at is None:
        return False
    cur.execute("""
        SELECT GREATEST(
            COALESCE((SELECT MAX(changed_at) FROM supplies_location_history), '1970-01-01 00:00:00'),
            COALESCE((SELECT MAX(changed_at) FROM supplies_history), '1970-01-01 00:00:00')
        ) AS latest
    """)
    row = cur.fetchone()
    latest = row['latest'] if row else None
    if latest is None:
        return False
    return changed_at == latest
