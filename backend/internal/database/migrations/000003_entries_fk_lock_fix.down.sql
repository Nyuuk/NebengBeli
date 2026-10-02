-- Migration 000003 Down: Revoke the column-level UPDATE grant added for FK row-locking
REVOKE UPDATE (correction_reason) ON TABLE entries FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli') THEN
        REVOKE UPDATE (correction_reason) ON TABLE entries FROM nebengbeli;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE (correction_reason) ON TABLE entries FROM app_user;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli_app') THEN
        REVOKE UPDATE (correction_reason) ON TABLE entries FROM nebengbeli_app;
    END IF;
END
$$;
