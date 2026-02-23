-- Location metadata and layout coordinates (all stored in DB, synced to JSON for frontend)
CREATE TABLE locations (
    name         VARCHAR(100) PRIMARY KEY,   -- e.g. "Drawer A", "Tall Cabinet 103"
    type         VARCHAR(50)  NOT NULL,       -- "drawer", "cabinet", "table", "workbench", "tall_cabinet"
    x            INT          NOT NULL DEFAULT 0,  -- X coordinate for layout
    y            INT          NOT NULL DEFAULT 0,  -- Y coordinate for layout
    width        INT          NOT NULL DEFAULT 150,  -- Width in pixels
    height       INT          NOT NULL DEFAULT 150,  -- Height in pixels
    shelf_count  INT          NOT NULL DEFAULT 0,  -- 6 for Tall Cabinets, 0 for everything else
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

