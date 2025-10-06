CREATE TABLE students (
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    uf_id SERIAL PRIMARY KEY,
    uf_email VARCHAR(150) NOT NULL UNIQUE,
    phone_number VARCHAR(50),
    team VARCHAR(50),
    discord VARCHAR(150) NOT NULL UNIQUE,
    github VARCHAR(150) NOT NULL UNIQUE,
    grad_date DATE,
    join_date DATE,
    is_leader BOOLEAN DEFAULT FALSE
);