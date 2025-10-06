CREATE TABLE member_progress (
    progress_id SERIAL PRIMARY KEY,
    uf_id INT REFERENCES members(uf_id),
    report_date DATE NOT NULL,
    progress_percent INT DEFAULT 0
);
