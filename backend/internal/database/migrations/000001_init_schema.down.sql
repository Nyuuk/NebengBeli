DROP TRIGGER IF EXISTS trigger_prevent_entries_mutation ON entries;
DROP FUNCTION IF EXISTS prevent_entries_mutation();
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS link_requests;
DROP TABLE IF EXISTS entries;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS users;
