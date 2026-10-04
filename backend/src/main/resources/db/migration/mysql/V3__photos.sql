-- Profile photos move from the server's disk into the database, so they survive redeploys on hosts
-- with a temporary filesystem. users.photo_path keeps holding the random name used in the photo URL.
-- Keep in step with ../postgresql/V3__photos.sql.

CREATE TABLE photos (
    name         VARCHAR(40) NOT NULL PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL,
    data         MEDIUMBLOB  NOT NULL,
    created_at   DATETIME(6) NOT NULL
);
