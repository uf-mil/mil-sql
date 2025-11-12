-- Location has coordinates that will be used to position it in the svg in the frontend.
CREATE TABLE locations (
    name    VARCHAR(50) PRIMARY KEY,
    x       INTEGER NOT NULL,
    y       INTEGER NOT NULL,
    width   INTEGER NOT NULL,
    height  INTEGER NOT NULL,
    type    VARCHAR(50) NOT NULL
);

