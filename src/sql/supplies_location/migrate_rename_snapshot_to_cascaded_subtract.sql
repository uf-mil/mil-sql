-- Migration: Rename SUPPLY_DELETE_SNAPSHOT to CASCADED_SUBTRACT
-- This better reflects that deleting a master item cascades to subtract all location entries

-- Step 1: Update existing history entries
UPDATE supplies_location_history
SET action_type = 'CASCADED_SUBTRACT'
WHERE action_type = 'SUPPLY_DELETE_SNAPSHOT';

-- Step 2: Modify the ENUM to replace SUPPLY_DELETE_SNAPSHOT with CASCADED_SUBTRACT
-- Note: MySQL doesn't support direct ENUM modification, so we need to:
-- 1. Add the new value
-- 2. Update existing rows (done above)
-- 3. Remove the old value

-- Add CASCADED_SUBTRACT to the enum (if it doesn't exist)
ALTER TABLE supplies_location_history
MODIFY COLUMN action_type ENUM('ADD', 'REMOVE', 'UPDATE', 'MOVE', 'SUPPLY_DELETE_SNAPSHOT', 'CASCADED_SUBTRACT') NOT NULL;

-- Remove SUPPLY_DELETE_SNAPSHOT from the enum (MySQL will only allow this if no rows use it)
-- Since we updated all rows above, this should work:
ALTER TABLE supplies_location_history
MODIFY COLUMN action_type ENUM('ADD', 'REMOVE', 'UPDATE', 'MOVE', 'CASCADED_SUBTRACT') NOT NULL;

