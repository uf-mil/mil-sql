CREATE TABLE teams (
    name    VARCHAR(50) CHECK (name IN ('Software', 'Electrical', 'Mechanical')) PRIMARY KEY
);

INSERT INTO teams (name)
VALUES 
('Software'), 
('Electrical'), 
('Mechanical');
