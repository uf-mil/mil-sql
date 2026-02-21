-- Location metadata (layout coordinates are in inventory-locations.json, not stored in DB)
CREATE TABLE locations (
    name         VARCHAR(100) PRIMARY KEY,   -- e.g. "Drawer A", "Tall Cabinet 103"
    type         VARCHAR(50)  NOT NULL,       -- "drawer", "cabinet", "table", "workbench", "tall_cabinet"
    shelf_count  INT          NOT NULL DEFAULT 0,  -- 6 for Tall Cabinets, 0 for everything else
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

