-- NebengBeli Core Schema: Exactly 5 tables
-- 1. users
-- 2. wallets
-- 3. entries (immutable signed BIGINT ledger)
-- 4. link_requests
-- 5. audit_logs

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table 1: users (only contract fields, updated_at is forbidden)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'user',
    token_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Table 2: wallets (only contract fields)
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_creator_id ON wallets(creator_id);
CREATE INDEX IF NOT EXISTS idx_wallets_owner_id ON wallets(owner_id);
CREATE INDEX IF NOT EXISTS idx_wallets_archived_at ON wallets(archived_at);

-- Table 3: entries (Immutable Signed BIGINT Ledger)
CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID UNIQUE NOT NULL,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    type VARCHAR(32) NOT NULL CHECK (type IN ('titipan', 'topup', 'koreksi')),
    amount BIGINT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    corrects_entry_id UUID REFERENCES entries(id) ON DELETE RESTRICT,
    correction_reason TEXT NOT NULL DEFAULT '',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_wallet_id ON entries(wallet_id);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);
CREATE INDEX IF NOT EXISTS idx_entries_occurred_at ON entries(occurred_at);
CREATE INDEX IF NOT EXISTS idx_entries_client_id ON entries(client_id);
CREATE INDEX IF NOT EXISTS idx_entries_corrects_entry_id ON entries(corrects_entry_id);

-- Immutability enforcement on entries: Trigger to raise error on UPDATE or DELETE
CREATE OR REPLACE FUNCTION prevent_entries_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'NebengBeli ledger entries are strictly immutable. UPDATE and DELETE are prohibited on entries table.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_entries_mutation ON entries;
CREATE TRIGGER trigger_prevent_entries_mutation
    BEFORE UPDATE OR DELETE ON entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_entries_mutation();

-- Table 4: link_requests
CREATE TABLE IF NOT EXISTS link_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_link_requests_wallet_id ON link_requests(wallet_id);
CREATE INDEX IF NOT EXISTS idx_link_requests_requested_by ON link_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_link_requests_target_user_id ON link_requests(target_user_id);
CREATE INDEX IF NOT EXISTS idx_link_requests_status ON link_requests(status);

-- Table 5: audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(64) NOT NULL,
    target_id VARCHAR(128),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_type ON audit_logs(target_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
