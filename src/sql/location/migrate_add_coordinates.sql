-- Migration: Add x, y, width, height columns to locations table
-- This migration adds coordinate columns to existing locations table

-- Check if columns exist before adding (idempotent)
-- Note: MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN directly
-- So we'll use a stored procedure approach or just run ALTER TABLE

ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS x INT NOT NULL DEFAULT 0 AFTER type,
ADD COLUMN IF NOT EXISTS y INT NOT NULL DEFAULT 0 AFTER x,
ADD COLUMN IF NOT EXISTS width INT NOT NULL DEFAULT 150 AFTER y,
ADD COLUMN IF NOT EXISTS height INT NOT NULL DEFAULT 150 AFTER width;



