-- Items placed in locations (frontend inventory)
CREATE TABLE supplies_location (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    supply_id       BIGINT NOT NULL,
    location_name   VARCHAR(100) NOT NULL,
    shelf           INT DEFAULT NULL,            -- NULL for non-shelf locations; 0-5 for Tall Cabinet shelves
    amount          INTEGER NOT NULL DEFAULT 0,   -- qty/quantity
    last_modified   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified_by CHAR(8),                      -- UF ID of user who last modified (nullable, FK to members.uf_id)
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_supply_location_supply FOREIGN KEY (supply_id) REFERENCES supplies(id)
        ON UPDATE CASCADE ON DELETE CASCADE,  -- CASCADE: deleting a supply removes all its locations
    CONSTRAINT fk_supply_location_location FOREIGN KEY (location_name) REFERENCES locations(name)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_supply_location_modified_by FOREIGN KEY (last_modified_by) REFERENCES members(uf_id)
        ON UPDATE CASCADE ON DELETE SET NULL,

    UNIQUE KEY unique_supply_location_shelf (supply_id, location_name, shelf)
);

