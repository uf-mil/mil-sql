CREATE TABLE IF NOT EXISTS supplies_categories (
    supply_id BIGINT NOT NULL,
    category_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (supply_id, category_id),
    CONSTRAINT fk_supplies_categories_supply FOREIGN KEY (supply_id) REFERENCES supplies(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_supplies_categories_category FOREIGN KEY (category_id) REFERENCES categories(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_supply_id (supply_id),
    INDEX idx_category_id (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



