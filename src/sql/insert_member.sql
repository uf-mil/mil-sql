-- Inserts into members table and returns the uf_id of the new member
INSERT INTO members(first_name,last_name,uf_email,phone_number,team,discord,github,grad_date,join_date,is_leader)
VALUES (%(first)s,%(last)s,%(email)s,%(phone)s,%(team)s,%(discord)s,%(github)s,%(grad)s,%(join)s,%(leader)s)
RETURNING uf_id;
