CREATE TABLE supplies (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,              
    name            VARCHAR(200) NOT NULL,
    amount          INTEGER NOT NULL DEFAULT 0,
    last_order_date DATE,
    location        VARCHAR(50) REFERENCES locations(name)
);
