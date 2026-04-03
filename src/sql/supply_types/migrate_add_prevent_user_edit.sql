-- Lock type definition edits to leaders only when set (see supply_types.prevent_user_edit).
ALTER TABLE supply_types
  ADD COLUMN prevent_user_edit TINYINT(1) NOT NULL DEFAULT 0
  AFTER is_unique;
