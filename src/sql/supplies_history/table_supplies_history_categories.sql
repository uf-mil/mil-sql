CREATE TABLE supplies_history_categories (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    history_id          BIGINT NOT NULL,
    category_id         INT NOT NULL,
    action              ENUM('ADDED', 'REMOVED') NOT NULL,
    
    CONSTRAINT fk_history_categories_history FOREIGN KEY (history_id) REFERENCES supplies_history(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
