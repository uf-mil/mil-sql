CREATE TABLE supplies (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    public_id       CHAR(36)     NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    image           LONGTEXT,                  -- Base64-encoded image data (nullable)
    last_order_date DATE,                     -- Keep for backend tracking, not shown in frontend
    last_modified   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified_by CHAR(8),                  -- UF ID of user who last modified (nullable, FK to members.uf_id)
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_supplies_public_id (public_id),
    
    CONSTRAINT fk_supplies_modified_by FOREIGN KEY (last_modified_by) REFERENCES members(uf_id)
        ON UPDATE CASCADE ON DELETE SET NULL
);
