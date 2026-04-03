-- Template types for master supplies (item types)
CREATE TABLE supply_types (
    id                      BIGINT AUTO_INCREMENT PRIMARY KEY,
    name                    VARCHAR(200) NOT NULL,
    template_description    TEXT NULL,
    item_name_prefix        VARCHAR(200) NOT NULL DEFAULT '',
    item_description_prefix TEXT NULL,
    image                   LONGTEXT NULL,
    default_custom_fields   JSON NULL,
    locked_custom_field_keys JSON NULL,
    locked_category_ids     JSON NULL,
    locked_team_names       JSON NULL,
    is_unique               TINYINT(1) NOT NULL DEFAULT 0,
    prevent_user_edit       TINYINT(1) NOT NULL DEFAULT 0,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_supply_types_name (name)
);
