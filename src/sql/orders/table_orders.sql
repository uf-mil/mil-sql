CREATE TABLE IF NOT EXISTS orders (
    order_id			BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_name			VARCHAR(50),
    count			    INT,
    company			    VARCHAR(50),
    item_description	VARCHAR(200),
    cost_estimate		INT,
    purchase_link		VARCHAR(200),
    requester_id		CHAR(8) REFERENCES members(uf_id),
    leader_id			CHAR(8) REFERENCES members(uf_id)
);
