-- History of all location operations (ADD, REMOVE, UPDATE, MOVE, CASCADED_SUBTRACT)
CREATE TABLE supplies_location_history (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,

    -- Supply reference (nullable: SET NULL when supply is hard-deleted)
    supply_id       BIGINT NULL,
    -- Denormalized supply name: REQUIRED for restoration after supply deletion
    supply_name     VARCHAR(200) NOT NULL,

    -- Location info (denormalized: location rows can be renamed/deleted)
    location_name   VARCHAR(100) NOT NULL,
    shelf           INT DEFAULT NULL,

    -- Action
    action_type     ENUM('ADD', 'REMOVE', 'UPDATE', 'MOVE', 'CASCADED_SUBTRACT') NOT NULL,
    --   ADD    = units placed into this location
    --   REMOVE = units removed from this location
    --   UPDATE = amount changed directly (e.g. edit qty field)
    --   MOVE   = units moved between locations (generates two rows: one REMOVE, one ADD)
    --   CASCADED_SUBTRACT = items subtracted from location when master item is deleted (CASCADE)

    -- Amounts (NULL means "not applicable" for that side)
    old_amount      INT DEFAULT NULL,   -- amount before change (NULL for ADD)
    new_amount      INT DEFAULT NULL,   -- amount after change  (NULL for REMOVE/CASCADED_SUBTRACT)

    -- For MOVE actions: where the units came from / went to
    related_location  VARCHAR(100) DEFAULT NULL,  -- the other location in a MOVE
    related_shelf     INT DEFAULT NULL,

    -- For grouping a single logical operation (e.g. bulk-add touches multiple rows)
    batch_id        CHAR(36) DEFAULT NULL,   -- UUID generated per API call

    -- Undo bookkeeping (DEPRECATED: Entries are now DELETED entirely when undone)
    -- NOTE: The undone fields are kept for backward compatibility but are no longer used.
    --       When an action is undone, the history entry is DELETED entirely from the database.
    --       See undo_location_history and undo_batch_history endpoints which DELETE entries.
    undone          BOOLEAN NOT NULL DEFAULT FALSE,
    undone_at       DATETIME DEFAULT NULL,
    undone_by       CHAR(8) DEFAULT NULL,

    -- Audit
    changed_by      CHAR(8) DEFAULT NULL,
    changed_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_supply_id   (supply_id),
    INDEX idx_supply_name (supply_name),
    INDEX idx_location    (location_name),
    INDEX idx_changed_at  (changed_at DESC),
    INDEX idx_batch       (batch_id),
    INDEX idx_undone      (undone, changed_at DESC),

    -- FKs
    CONSTRAINT fk_slh_supply
        FOREIGN KEY (supply_id) REFERENCES supplies(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_slh_changed_by
        FOREIGN KEY (changed_by) REFERENCES members(uf_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_slh_undone_by
        FOREIGN KEY (undone_by) REFERENCES members(uf_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

