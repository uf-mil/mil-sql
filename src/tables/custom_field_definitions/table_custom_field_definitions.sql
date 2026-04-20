CREATE TABLE custom_field_definitions (
    id   INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL UNIQUE COMMENT 'display name and key',
    type VARCHAR(20) NOT NULL COMMENT 'text, number, or date',
    CONSTRAINT chk_type CHECK (type IN ('text', 'number', 'date'))
);
