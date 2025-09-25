CREATE TABLE students(
	id		INT, 
	name		VARCHAR(100), 
	age		INT, 
	last_update	DATETIME DEFAULT (CURRENT_TIME()),
	PRIMARY KEY(id)
);

--WARNING: Inserts should be done in the scripts NOT IN THE SQL FILE--

INSERT INTO students(id, name, age) 
VALUES 
(1, "Robin", 22),
(2, "Beast Boy", 21),
(3, "Star Fire", 400),
(4, "Raven", 20),
(5, "Cyborg", 21);
