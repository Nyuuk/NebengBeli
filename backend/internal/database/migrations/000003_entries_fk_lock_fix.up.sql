-- Migration 000003: Allow the FK row-lock behind corrects_entry_id without reopening immutability
--
-- PostgreSQL requires UPDATE privilege on a table to acquire the implicit
-- "FOR KEY SHARE" row lock that the self-referencing entries_corrects_entry_id_fkey
-- constraint takes on the referenced row during every INSERT. Migration 000002
-- revoked UPDATE on all of entries to enforce ledger immutability, which as a side
-- effect made every koreksi insert fail with "permission denied for table entries"
-- (SELECT/INSERT/REFERENCES alone are not sufficient for row locking).
--
-- Column-level UPDATE privilege is sufficient to satisfy the row-lock check, so
-- grant it on correction_reason only: a non-financial column the application never
-- updates. amount, type, item_name, wallet_id, occurred_at, corrects_entry_id, etc.
-- remain fully protected against UPDATE.

GRANT UPDATE (correction_reason) ON TABLE entries TO PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli') THEN
        GRANT UPDATE (correction_reason) ON TABLE entries TO nebengbeli;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT UPDATE (correction_reason) ON TABLE entries TO app_user;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nebengbeli_app') THEN
        GRANT UPDATE (correction_reason) ON TABLE entries TO nebengbeli_app;
    END IF;
END
$$;
