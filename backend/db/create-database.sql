-- One-time MySQL setup for local development. Run as root:
--   mysql -u root -p < backend/db/create-database.sql
-- or open it in MySQL Workbench and execute.
--
-- Only the empty database and an app user are created here. Flyway creates the
-- tables on the backend's first start, and the dev profile then loads demo data.
-- The password matches the dev default in application.yml; if you change it,
-- start the backend with DB_PASSWORD set to the new value.

CREATE DATABASE IF NOT EXISTS smart_campus_events
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'scems_app'@'localhost' IDENTIFIED BY 'scems_local_dev';
GRANT ALL PRIVILEGES ON smart_campus_events.* TO 'scems_app'@'localhost';
FLUSH PRIVILEGES;
