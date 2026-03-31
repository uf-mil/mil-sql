-- Add stable public UUID per supply; allow duplicate display names.
-- Prefer the idempotent Python migration (also runs on API startup):
--   python src/scripts/migrate_supplies_public_id.py
-- Or run this SQL manually after backup. MySQL 8+ recommended (UUID() per row in UPDATE).

ALTER TABLE supplies ADD COLUMN public_id CHAR(36) NULL;

UPDATE supplies SET public_id = UUID() WHERE public_id IS NULL;

ALTER TABLE supplies MODIFY COLUMN public_id CHAR(36) NOT NULL;

ALTER TABLE supplies ADD UNIQUE INDEX uq_supplies_public_id (public_id);

-- Drop unique constraint on name (index name may be `name` — verify with SHOW CREATE TABLE supplies)
ALTER TABLE supplies DROP INDEX name;
