-- Objectives 4 and 5. Plain SQL that runs unchanged on MySQL 8, PostgreSQL and H2.

-- Manual attendance (an organizer marks someone present without a scan) must say why.
-- entries.method gains the value 'OVERRIDE' (the column is VARCHAR(10)).
ALTER TABLE entries ADD COLUMN override_reason VARCHAR(300);

-- The audit-log viewer filters by action and sorts by time.
CREATE INDEX idx_audit_action_time ON audit_logs (action, created_at);
