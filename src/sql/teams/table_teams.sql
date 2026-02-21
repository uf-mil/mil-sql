CREATE TABLE IF NOT EXISTS teams (
    name    VARCHAR(50) CHECK (name IN ('Software', 'Electrical', 'Mechanical')) PRIMARY KEY
);

INSERT IGNORE INTO teams (name)
VALUES 
('Software'), 
('Electrical'), 
('Mechanical');
