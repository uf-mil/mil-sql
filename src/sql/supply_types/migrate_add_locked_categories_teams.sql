ALTER TABLE supply_types
  ADD COLUMN locked_category_ids JSON NULL
    COMMENT 'Category IDs always applied to items of this type; users may add more.'
    AFTER locked_custom_field_keys,
  ADD COLUMN locked_team_names JSON NULL
    COMMENT 'Team names (canonical) always applied to items of this type; users may add more.'
    AFTER locked_category_ids;
