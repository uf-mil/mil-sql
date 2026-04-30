-- Location metadata and layout coordinates (all stored in DB)
CREATE TABLE locations (
    name         VARCHAR(100) PRIMARY KEY,   -- e.g. "Drawer A", "Tall Cabinet 103"
    type         VARCHAR(50)  NOT NULL,       -- leader: drawer|cabinet|tall_cabinet|table|other; system: special
    x            INT          NOT NULL DEFAULT 0,  -- X coordinate for layout
    y            INT          NOT NULL DEFAULT 0,  -- Y coordinate for layout
    width        INT          NOT NULL DEFAULT 150,  -- Width in pixels
    height       INT          NOT NULL DEFAULT 150,  -- Height in pixels
    shelf_count  INT          NOT NULL DEFAULT 0,  -- 6 for Tall Cabinets, 0 for everything else
    protected    BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE for permanent locations from JSON
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

