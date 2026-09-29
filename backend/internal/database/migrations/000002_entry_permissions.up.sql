-- Migration 000002: Enforce Database-Level Application-Role Privileges on Entries
-- PRD: "Tambahkan hak DB-level supaya user aplikasi tidak punya izin UPDATE/DELETE pada entries."

-- 1. Revoke mutating permissions on entries from PUBLIC
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE entries FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE entries TO PUBLIC;

-- 2. Revoke mutating permissions from known application roles if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE entries FROM nebengbeli;
        GRANT SELECT, INSERT ON TABLE entries TO nebengbeli;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE entries FROM app_user;
        GRANT SELECT, INSERT ON TABLE entries TO app_user;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON TABLE entries FROM nebengbeli_app;
        GRANT SELECT, INSERT ON TABLE entries TO nebengbeli_app;
    END IF;
END
$$;
