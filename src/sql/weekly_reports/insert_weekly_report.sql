-- Inserts into members table and returns the uf_id of the new member
INSERT INTO weekly_reports(uf_id, report_date, progress_rating)
VALUES (%(uf_id)s,%(report_date)s,%(progress_rating)s)
RETURNING uf_id;