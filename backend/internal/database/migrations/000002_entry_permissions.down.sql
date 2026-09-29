-- Migration 000002 Down: Restore default permissions on entries table
GRANT UPDATE, DELETE, TRUNCATE ON TABLE entries TO PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli') THEN
        GRANT UPDATE, DELETE, TRUNCATE ON TABLE entries TO nebengbeli;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT UPDATE, DELETE, TRUNCATE ON TABLE entries TO app_user;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli_app') THEN
        GRANT UPDATE, DELETE, TRUNCATE ON TABLE entries TO nebengbeli_app;
    END IF;
END
$$;
