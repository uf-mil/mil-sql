CREATE TABLE student_progress (
    progress_id SERIAL PRIMARY KEY,
    student_id INT REFERENCES students(student_id),
    report_date DATE NOT NULL,
    progress_percent INT DEFAULT 0
);
