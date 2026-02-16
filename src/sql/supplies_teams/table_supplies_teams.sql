CREATE TABLE IF NOT EXISTS supplies_teams (
    supply_id BIGINT NOT NULL,
    team_name VARCHAR(50) NOT NULL COLLATE utf8mb4_0900_ai_ci,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (supply_id, team_name),
    CONSTRAINT fk_supplies_teams_supply FOREIGN KEY (supply_id) REFERENCES supplies(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_supplies_teams_team FOREIGN KEY (team_name) REFERENCES teams(name)
        ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_supply_id (supply_id),
    INDEX idx_team_name (team_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

