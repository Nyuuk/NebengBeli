# NebengBeli System Architecture & Ledger Contract

NebengBeli is a peer-to-peer and small-group shared ledger application designed specifically for tracking expenses made on behalf of friends (*titipan*), reimbursements/settlements (*topup*), and append-only adjustments (*koreksi*).

---

## 1. Core Schema Model (Strictly Exactly 5 Tables)

To guarantee immutability, simplicity, and zero double-entry overhead, the entire domain is modelled on exactly five core tables:

```
+--------------------------------------------------------------------+
|                             users                                  |
| (id, username, password_hash, role, token_version, created_at)     |
+--------------------------------------------------------------------+
                                  |
                                  | 1:N
                                  v
+--------------------------------------------------------------------+
|                            wallets                                 |
| (id, name, creator_id, owner_id, archived_at, created_at)          |
+--------------------------------------------------------------------+
              |                                        |
              | 1:N                                    | 1:N
              v                                        v
+---------------------------------------+  +-------------------------+
|                entries                |  |      link_requests      |
| (id, client_id, wallet_id, type,      |  | (id, wallet_id,         |
|  amount [signed BIGINT], item_name,   |  |  requested_by,          |
|  note, corrects_entry_id,             |  |  target_user_id, status,|
|  correction_reason, occurred_at,      |  |  decided_at, created_at)|
|  created_by, created_at)              |  +-------------------------+
+---------------------------------------+

+--------------------------------------------------------------------+
|                           audit_logs                               |
| (id, actor_id, action, target_type, target_id, metadata, created_at)|
+--------------------------------------------------------------------+
```

### Table Specifications:

1. **`users`** (Strictly contract fields only; `updated_at` is forbidden):
   - `id` (UUID PK)
   - `username` (VARCHAR UNIQUE)
   - `password_hash` (Bcrypt hash)
   - `role` (`user` | `admin`)
   - `token_version` (INT, incremented on logout/password reset to immediately invalidate JWTs)
   - `created_at` (TIMESTAMPTZ)

2. **`wallets`** (Contract fields only):
   - `id` (UUID PK)
   - `name` (VARCHAR)
   - `creator_id` (UUID FK -> users.id)
   - `owner_id` (UUID FK -> users.id, nullable or linked user)
   - `archived_at` (TIMESTAMPTZ, null for active wallets)
   - `created_at` (TIMESTAMPTZ)

3. **`entries` (Strictly Immutable Signed BIGINT Ledger)**:
   - `id` (UUID PK)
   - `client_id` (UUID UNIQUE, client-generated UUID for offline idempotency)
   - `wallet_id` (UUID FK -> wallets.id)
   - `type` (`titipan` | `topup` | `koreksi`)
   - `amount` (Signed BIGINT: positive = debt/expense, negative = repayment/credit)
   - `item_name` (VARCHAR)
   - `note` (TEXT)
   - `corrects_entry_id` (UUID FK -> entries.id, nullable)
   - `correction_reason` (TEXT)
   - `occurred_at` (TIMESTAMPTZ)
   - `created_by` (UUID FK -> users.id)
   - `created_at` (TIMESTAMPTZ)
   - *Database Protection*: Plpgsql trigger `trigger_prevent_entries_mutation` strictly aborts any `UPDATE` or `DELETE` statement.

4. **`link_requests`**:
   - `id` (UUID PK)
   - `wallet_id` (UUID FK -> wallets.id)
   - `requested_by` (UUID FK -> users.id)
   - `target_user_id` (UUID FK -> users.id)
   - `status` (`pending` | `approved` | `rejected`)
   - `decided_at` (TIMESTAMPTZ, nullable)
   - `created_at` (TIMESTAMPTZ)

5. **`audit_logs`**:
   - `id` (UUID PK)
   - `actor_id` (UUID FK -> users.id, nullable)
   - `action` (VARCHAR, e.g. `entry.create`, `wallet.archive`, `user.login`)
   - `target_type` (VARCHAR, e.g. `entry`, `wallet`, `user`)
   - `target_id` (VARCHAR)
   - `metadata` (JSONB)
   - `created_at` (TIMESTAMPTZ)

---

## 2. Ledger Mathematics & Rules

1. **Balance Equation**:
   $$\text{Wallet Balance} = \sum_{e \in \text{entries}} e.\text{amount}$$
   - **`amount > 0`**: Titipan / pengeluaran (friend owes maker).
   - **`amount < 0`**: Topup / pelunasan (reimbursement paid down).
   - **`amount == 0`**: Fully settled (Lunas).

2. **Correction (`koreksi`)**:
   - Never mutates the original entry.
   - Creates a new entry with `type = 'koreksi'`, specifying `corrects_entry_id` pointing to the target entry, containing either a full reversal ($-1 \times \text{original}$) or differential delta.

3. **Moving Entries Across Wallets (`pindah wallet`)**:
   - Executed inside a single atomic ACID transaction.
   - Appends a `koreksi` with $-\text{amount}$ in the source wallet.
   - Appends a new entry with $+\text{amount}$ in the destination wallet.

---

## 3. Security & Session Revocation Model

- **Authentication**: Secure `HttpOnly`, `SameSite=Lax` cookie `nebeng_token` containing signed JWT (HS256).
- **Session Revocation (`token_version`)**: Each JWT embeds `token_version`. Whenever a user logs out or an admin resets a password, the database updates `token_version = token_version + 1`. All previously issued JWTs are rejected immediately.
- **Authorization**: Wallets are accessible only to their `creator_id`, `owner_id`, or `admin` role.
- **Rate Limiting**: In-memory token bucket rate limiters on auth (20 req/min) and API endpoints (120 req/min).

---

## 4. Offline-First PWA Architecture

```
[User Action in Offline State]
             │
             ▼
[Generate UUID Client ID]
             │
             ▼
[Persist into IndexedDB `offline_entries` Object Store]
             │
             ▼
[Optimistic UI Update in React (Balance & Statement View)]
             │
   (Network Online Event)
             │
             ▼
[Background Sync Queue Runner (`syncOfflineQueue`)]
             │
             ▼
[POST /api/wallets/:id/entries with Header `Client-ID`]:
    ├── Status 201/200: Successfully written -> Delete from IndexedDB
    └── Status 4xx / Dup: Resolved -> Remove from queue
```
