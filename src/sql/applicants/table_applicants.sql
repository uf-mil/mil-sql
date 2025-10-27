CREATE TABLE applicants (
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    uf_id           CHAR(8) NOT NULL CHECK (uf_id ~ '^[0-9]{8}$') PRIMARY KEY,
    discord_user    VARCHAR(150),
    github_user     VARCHAR(150),
    qualtrics_link  VARCHAR(200)
);

