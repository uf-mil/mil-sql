CREATE TABLE member_progress (
    uf_id INT REFERENCES members(uf_id),
    report_date DATE NOT NULL,
    progress_rating VARCHAR(50) CHECK (progress_rating IN ('Red', 'Yellow', 'Green')),
    PRIMARY KEY (uf_id, report_date)
);
