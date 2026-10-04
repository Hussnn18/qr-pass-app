-- Smart Campus Event Management and Secure QR Access System
-- Schema for objectives 1-3 (events, authentication/registration, passes and entry control).
-- Written to run on MySQL 8 and on H2 in MySQL mode (used by tests).

CREATE TABLE departments (
    code VARCHAR(10)  NOT NULL PRIMARY KEY,
    name VARCHAR(120) NOT NULL
);

CREATE TABLE users (
    id                   BIGINT AUTO_INCREMENT PRIMARY KEY,
    role                 VARCHAR(20)  NOT NULL,
    full_name            VARCHAR(120) NOT NULL,
    email                VARCHAR(160) NOT NULL,
    phone                VARCHAR(30),
    unit                 VARCHAR(120),
    password_hash        VARCHAR(100) NOT NULL,
    status               VARCHAR(20)  NOT NULL,
    must_change_password BOOLEAN      NOT NULL,
    failed_logins        INT          NOT NULL,
    locked_until         DATETIME(6),
    photo_path           VARCHAR(80),
    last_login_at        DATETIME(6),
    created_at           DATETIME(6)  NOT NULL,
    updated_at           DATETIME(6)  NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email)
);
CREATE INDEX idx_users_role_status ON users (role, status);

CREATE TABLE student_profiles (
    user_id         BIGINT      NOT NULL PRIMARY KEY,
    urn             VARCHAR(12) NOT NULL,
    department_code VARCHAR(10) NOT NULL,
    semester        INT         NOT NULL,
    section         VARCHAR(2)  NOT NULL,
    batch           INT,
    dob             DATE,
    enrolled        BOOLEAN     NOT NULL,
    CONSTRAINT uk_student_urn UNIQUE (urn),
    CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_student_dept FOREIGN KEY (department_code) REFERENCES departments (code),
    CONSTRAINT ck_student_semester CHECK (semester BETWEEN 1 AND 8)
);
CREATE INDEX idx_student_dept_sem ON student_profiles (department_code, semester);

CREATE TABLE refresh_tokens (
    id         BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    token_hash CHAR(64)    NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    revoked_at DATETIME(6),
    created_at DATETIME(6) NOT NULL,
    CONSTRAINT uk_refresh_hash UNIQUE (token_hash),
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE venues (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    type            VARCHAR(20)  NOT NULL,
    building        VARCHAR(120),
    floor           VARCHAR(30),
    description     VARCHAR(500),
    capacity        INT,
    can_host_events BOOLEAN      NOT NULL,
    active          BOOLEAN      NOT NULL,
    latitude        DOUBLE,
    longitude       DOUBLE,
    created_at      DATETIME(6)  NOT NULL,
    updated_at      DATETIME(6)  NOT NULL
);

CREATE TABLE gates (
    id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    venue_id BIGINT      NOT NULL,
    name     VARCHAR(80) NOT NULL,
    CONSTRAINT uk_gate_name UNIQUE (venue_id, name),
    CONSTRAINT fk_gate_venue FOREIGN KEY (venue_id) REFERENCES venues (id)
);

CREATE TABLE events (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(120)  NOT NULL,
    description     VARCHAR(4000) NOT NULL,
    category        VARCHAR(20)   NOT NULL,
    venue_id        BIGINT        NOT NULL,
    starts_at       DATETIME(6)   NOT NULL,
    ends_at         DATETIME(6)   NOT NULL,
    reg_opens_at    DATETIME(6)   NOT NULL,
    reg_closes_at   DATETIME(6)   NOT NULL,
    capacity        INT           NOT NULL,
    confirmed_count INT           NOT NULL DEFAULT 0,
    mode            VARCHAR(20)   NOT NULL,
    allow_outsiders BOOLEAN       NOT NULL,
    status          VARCHAR(20)   NOT NULL,
    cancel_reason   VARCHAR(300),
    created_by      BIGINT        NOT NULL,
    created_at      DATETIME(6)   NOT NULL,
    updated_at      DATETIME(6)   NOT NULL,
    CONSTRAINT fk_event_venue FOREIGN KEY (venue_id) REFERENCES venues (id),
    CONSTRAINT ck_event_times CHECK (ends_at > starts_at),
    -- Seats can never be over-booked: the counter is only changed by conditional UPDATEs.
    CONSTRAINT ck_event_capacity CHECK (capacity > 0 AND confirmed_count >= 0 AND confirmed_count <= capacity)
);
CREATE INDEX idx_event_venue_time ON events (venue_id, starts_at);
CREATE INDEX idx_event_status_time ON events (status, starts_at);

CREATE TABLE event_organizers (
    event_id BIGINT NOT NULL,
    user_id  BIGINT NOT NULL,
    PRIMARY KEY (event_id, user_id),
    CONSTRAINT fk_org_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_org_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE event_eligible_departments (
    event_id        BIGINT      NOT NULL,
    department_code VARCHAR(10) NOT NULL,
    PRIMARY KEY (event_id, department_code),
    CONSTRAINT fk_eld_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_eld_dept FOREIGN KEY (department_code) REFERENCES departments (code)
);

CREATE TABLE event_eligible_semesters (
    event_id BIGINT NOT NULL,
    semester INT    NOT NULL,
    PRIMARY KEY (event_id, semester),
    CONSTRAINT fk_els_event FOREIGN KEY (event_id) REFERENCES events (id)
);

CREATE TABLE event_eligible_sections (
    event_id BIGINT     NOT NULL,
    section  VARCHAR(2) NOT NULL,
    PRIMARY KEY (event_id, section),
    CONSTRAINT fk_elc_event FOREIGN KEY (event_id) REFERENCES events (id)
);

CREATE TABLE event_gates (
    event_id BIGINT NOT NULL,
    gate_id  BIGINT NOT NULL,
    PRIMARY KEY (event_id, gate_id),
    CONSTRAINT fk_eg_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_eg_gate FOREIGN KEY (gate_id) REFERENCES gates (id)
);

CREATE TABLE security_assignments (
    id       BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    gate_id  BIGINT NOT NULL,
    user_id  BIGINT NOT NULL,
    CONSTRAINT uk_assignment UNIQUE (event_id, gate_id, user_id),
    CONSTRAINT fk_as_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_as_gate FOREIGN KEY (gate_id) REFERENCES gates (id),
    CONSTRAINT fk_as_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE registrations (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id      BIGINT      NOT NULL,
    user_id       BIGINT      NOT NULL,
    status        VARCHAR(20) NOT NULL,
    note          VARCHAR(300),
    reason        VARCHAR(300),
    registered_at DATETIME(6) NOT NULL,
    decided_at    DATETIME(6),
    decided_by    BIGINT,
    -- One registration per student per event.
    CONSTRAINT uk_registration UNIQUE (event_id, user_id),
    CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_reg_user FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX idx_reg_event_status ON registrations (event_id, status, registered_at);
CREATE INDEX idx_reg_user ON registrations (user_id);

CREATE TABLE passes (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    registration_id BIGINT       NOT NULL,
    event_id        BIGINT       NOT NULL,
    user_id         BIGINT       NOT NULL,
    token_hash      CHAR(64)     NOT NULL,
    token_enc       VARCHAR(200) NOT NULL,
    code            VARCHAR(16)  NOT NULL,
    status          VARCHAR(20)  NOT NULL,
    issued_at       DATETIME(6)  NOT NULL,
    used_at         DATETIME(6),
    revoked_at      DATETIME(6),
    revoked_reason  VARCHAR(300),
    CONSTRAINT uk_pass_token UNIQUE (token_hash),
    CONSTRAINT uk_pass_code UNIQUE (code),
    CONSTRAINT fk_pass_reg FOREIGN KEY (registration_id) REFERENCES registrations (id),
    CONSTRAINT fk_pass_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_pass_user FOREIGN KEY (user_id) REFERENCES users (id)
);
CREATE INDEX idx_pass_reg ON passes (registration_id, status);
CREATE INDEX idx_pass_user ON passes (user_id, status);

CREATE TABLE entries (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    registration_id BIGINT      NOT NULL,
    pass_id         BIGINT,
    event_id        BIGINT      NOT NULL,
    gate_id         BIGINT      NOT NULL,
    scanned_by      BIGINT      NOT NULL,
    method          VARCHAR(10) NOT NULL,
    entered_at      DATETIME(6) NOT NULL,
    -- Second safety net against repeated entry (the first is the conditional UPDATE on passes).
    CONSTRAINT uk_entry_registration UNIQUE (registration_id),
    CONSTRAINT fk_entry_reg FOREIGN KEY (registration_id) REFERENCES registrations (id),
    CONSTRAINT fk_entry_pass FOREIGN KEY (pass_id) REFERENCES passes (id),
    CONSTRAINT fk_entry_event FOREIGN KEY (event_id) REFERENCES events (id),
    CONSTRAINT fk_entry_gate FOREIGN KEY (gate_id) REFERENCES gates (id)
);
CREATE INDEX idx_entry_event ON entries (event_id, entered_at);

CREATE TABLE scan_logs (
    id             BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id       BIGINT      NOT NULL,
    gate_id        BIGINT      NOT NULL,
    pass_id        BIGINT,
    participant_id BIGINT,
    scanned_by     BIGINT      NOT NULL,
    result         VARCHAR(30) NOT NULL,
    method         VARCHAR(10) NOT NULL,
    device_id      VARCHAR(60),
    scanned_at     DATETIME(6) NOT NULL
);
CREATE INDEX idx_scan_event_time ON scan_logs (event_id, scanned_at);
CREATE INDEX idx_scan_by_time ON scan_logs (scanned_by, scanned_at);

CREATE TABLE audit_logs (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id    BIGINT,
    action      VARCHAR(40)  NOT NULL,
    entity_type VARCHAR(30),
    entity_id   VARCHAR(40),
    details     VARCHAR(500),
    ip          VARCHAR(45),
    created_at  DATETIME(6)  NOT NULL
);
CREATE INDEX idx_audit_time ON audit_logs (created_at);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id);
