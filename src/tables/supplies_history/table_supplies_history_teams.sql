CREATE TABLE supplies_history_teams (
    id                  BIGINT AUTO_INCREMENT PRIMARY KEY,
    history_id          BIGINT NOT NULL,
    team_name           VARCHAR(50) NOT NULL,
    action              ENUM('ADDED', 'REMOVED') NOT NULL,
    
    CONSTRAINT fk_history_teams_history FOREIGN KEY (history_id) REFERENCES supplies_history(id)
        ON UPDATE CASCADE ON DELETE CASCADE
);
