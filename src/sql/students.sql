CREATE TABLE students (
    student_id SERIAL PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    ufid VARCHAR(20) NOT NULL UNIQUE,
    leader BOOLEAN DEFAULT FALSE,
    team VARCHAR(50),
    discord_id VARCHAR(50) NOT NULL UNIQUE
);