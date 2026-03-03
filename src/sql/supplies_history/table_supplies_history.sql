CREATE TABLE supplies_history (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    supply_id           BIGINT NOT NULL,
    action_type         ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    
    -- Snapshot of data before/after change
    old_name            VARCHAR(200),
    new_name            VARCHAR(200),
    old_description     TEXT,
    new_description     TEXT,
    old_image           LONGTEXT,
    new_image           LONGTEXT,
    old_last_order_date DATE,
    new_last_order_date DATE,
    
    -- Metadata
    changed_by          CHAR(8),  -- UF ID (nullable to allow member deletion)
    changed_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    undo_action_id      BIGINT NULL,  -- Points to history entry that undid this action
    
    -- Foreign keys
    CONSTRAINT fk_history_supply FOREIGN KEY (supply_id) REFERENCES supplies(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_history_changed_by FOREIGN KEY (changed_by) REFERENCES members(uf_id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_history_undo FOREIGN KEY (undo_action_id) REFERENCES supplies_history(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    
    INDEX idx_supply_id (supply_id),
    INDEX idx_changed_at (changed_at DESC),
    INDEX idx_action_type (action_type)
);
