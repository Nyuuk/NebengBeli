# NebengBeli Local HTTPS E2E Test Plan & Harness Guide

## 1. Scope and Architecture

- **Target**: Local merged codebase of `Nyuuk/NebengBeli`.
- **Browser Execution Environment**: Hermes / Camofox browser container accessing host services over Docker bridge (`172.17.0.1`) or local interface.
- **Why Local HTTPS is Required**:
  - In modern Chromium/WebKit browsers (including Camofox), navigating to an IP address over plain HTTP (e.g. `http://172.17.0.1:8088/`) causes `window.isSecureContext` to evaluate to `false`.
  - Service Workers (`navigator.serviceWorker`), cache storage APIs, and secure cookie flows strictly require a Secure Context (HTTPS or loopback `localhost`).
  - The local HTTPS harness terminates TLS on Nginx (port `8443`) using certificates with Subject Alternative Names (SAN) for `localhost`, `127.0.0.1`, `172.17.0.1`, `host.docker.internal`, and `nebengbeli-frontend`.
  - When Camofox connects via `https://172.17.0.1:8443/` or `https://localhost:8443/`, the page operates in a verified Secure Context with full Service Worker registration enabled.

## 2. Compose Topology and Port Mapping

```
+-------------------------------------------------------------------------+
| Host Network / Hermes Environment                                       |
|                                                                         |
|  Camofox Browser (Container) ---> https://172.17.0.1:8443 (Local HTTPS) |
|  Host Developer Tools        ---> https://localhost:8443  (Local HTTPS) |
|                              ---> http://localhost:8088   (Local HTTP)  |
|                              ---> http://localhost:8080   (Backend API) |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| Docker Compose (`nebengbeli`)                                           |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  | Frontend / Reverse Proxy Container (`nebengbeli-frontend`)         |  |
|  | - Ports: 8088:8080 (HTTP), 8443:8443 (HTTPS with TLS SAN)          |  |
|  | - Static Assets: Vite React PWA (/manifest.json, /sw.js)          |  |
|  | - Static SPA & Frontend Health Endpoint (/healthz)                 |  |
|  +-------------------------------------------------------------------+  |
|                                    | (internal network)                 |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | Backend Container (`nebengbeli-backend`)                          |  |
|  | - Port: 8080:8080 (REST API & Dev Endpoints)                      |  |
|  | - Administrative CLI: `/app/nebengbeli-cli`                       |  |
|  +-------------------------------------------------------------------+  |
|                                    | (internal network)                 |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  | Database Container (`nebengbeli-postgres`)                        |  |
|  | - Port: 5432:5432 (PostgreSQL 15 Alpine)                           |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

## 3. Credential Safety Invariants

1. **Zero Committed Secrets**:
   - No JWT secrets, PostgreSQL passwords, or user credentials exist in tracked git repository files.
   - `.env`, `.env.local`, `.env.e2e`, and `certs/` (private keys/certs) are strictly ignored by `.gitignore`.
2. **Dynamic Random Secret Generation**:
   - Setup scripts automatically generate strong random secrets using `openssl rand` for `POSTGRES_PASSWORD` and `JWT_SECRET`.
   - Admin account passwords generated during harness execution are passed directly in memory/CLI and never written to shared logs.
3. **Fail-Closed Dev Endpoints**:
   - Developer fixture endpoints (`/api/dev/*`) are strictly disabled in production mode.
   - Passwordless session issuance is permanently disabled/forbidden; all sessions require credential authentication.

## 4. Repeatable Harness Commands

| Task | Make Target | Direct Script Command | Description |
|---|---|---|---|
| **Generate TLS Certs** | `make certs` | `./scripts/generate-certs.sh` | Generates local TLS certs with SAN for localhost & Docker bridge IP (`172.17.0.1`). |
| **Setup Local HTTPS Stack** | `make e2e-setup` | `./scripts/e2e-setup.sh` | Generates safe `.env`, validates compose, starts stack, and waits for health probes. |
| **Seed Fixtures** | `make e2e-fixtures CMD="seed standard"` | `./scripts/e2e-fixtures.sh seed standard` | Seeds test users (`test_creator`, `test_owner`, `test_admin`) and sample wallet entries. |
| **Create Admin User** | `make e2e-fixtures CMD="create-admin <user> <pass>"` | `./scripts/e2e-fixtures.sh create-admin <user> <pass>` | Creates or promotes an admin user via the secure CLI tool. |
| **Reset Fixture Data** | `make e2e-fixtures CMD="reset"` | `./scripts/e2e-fixtures.sh reset` | Clears test database tables in local development mode. |
| **Run Smoke Verification** | `make e2e-smoke` | `./scripts/e2e-smoke.sh` | Runs 18 automated checks for container health, TLS, PWA assets, reverse proxy, and CLI. |
| **Full Orchestration** | `make e2e-test` | `./scripts/e2e-runner.sh` | Runs setup, seeds standard fixtures, and executes smoke verification in one command. |
| **Teardown & Cleanup** | `make e2e-cleanup` | `./scripts/e2e-cleanup.sh` | Stops compose containers. Pass `FLAGS="--all"` to wipe volumes, `.env`, and certs. |

## 5. End-to-End Test Matrix

### A. Platform and Authentication

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| A01 | Positive | Compose stack starts from a clean local environment | Required services are healthy and frontend/backend respond. |
| A02 | Positive | Open the application in a browser | Installable PWA UI loads without a visible API error over HTTPS. |
| A03 | Positive | Register a creator with username/password | Registration succeeds; authenticated creator landing page appears. |
| A04 | Negative | Register the same username again | Request is rejected with an understandable validation/error state. |
| A05 | Negative | Login with valid username and wrong password | Login is rejected; no authenticated page is shown. |
| A06 | Positive | Login/logout/login cycle | Session cookie works over HTTPS; logout removes access; re-login restores access. |
| A07 | Positive | Change own password, then use the old password | Existing session is revoked/old password is rejected; new password authenticates. |
| A08 | Security | Inspect tracked config/template files and compose config | No default admin password, JWT secret, DB password, or auto-seeded admin credential exists. |

### B. Wallet and Immutable Ledger

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| B01 | Positive | Creator creates a wallet without an owner | Wallet is created, active, and has a zero computed balance. |
| B02 | Positive | Creator adds a titipan with a unique client id | A single negative signed ledger entry is recorded; computed balance becomes negative. |
| B03 | Positive | Creator adds a top-up | A positive signed entry is recorded; balance equals the sum of entries. |
| B04 | Negative | Retry the same write with the same client id | Server is idempotent: no duplicate financial entry/balance change. |
| B05 | Positive | Correct a titipan to a new correct final amount | A new correction entry is appended; original is untouched; effective value and balance are correct. |
| B06 | Positive | Cancel an original titipan with correct amount zero | A correction is appended; effective original value is zero. |
| B07 | Negative | Attempt to correct a correction rather than an original entry | Request is rejected. |
| B08 | Negative | Owner/admin attempts creator-only financial write | Request is denied; ledger remains unchanged. |
| B09 | Positive | Move a titipan to another creator-owned wallet | One atomic operation appends source correction-to-zero and target titipan, with linked records. |
| B10 | Positive | Archive a nonzero wallet then view Archive | Warning is presented; archive succeeds; wallet is read-only in archive view. |

### C. Linking, Roles, Statements, Insights

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| C01 | Positive | Creator requests owner linking by owner username | Owner sees pending request with wallet and creator identity. |
| C02 | Positive | Owner approves the request | Owner sees the full pre-link wallet history, but cannot modify it. |
| C03 | Negative | Owner attempts rename/archive/write | Action is unavailable or denied with no mutation. |
| C04 | Positive | Creator disconnects owner | Owner loses access; wallet remains intact for creator. |
| C05 | Positive | Generate a day/week/month/custom statement | Statement includes start balance, dated entries, period total, end balance; start + total = end. |
| C06 | Positive | Copy statement text | Clipboard/export action provides the same statement text. |
| C07 | Positive | Creator dashboard | Negative active-wallet balances form the "money outside" metric; per-wallet insight/chart loads. |
| C08 | Positive | Admin dashboard/read-only views and password reset | Admin can list users/wallets/entries and reset password; ordinary user data views remain read-only. |

### D. PWA and Offline Queue

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| D01 | Positive | Manifest and service worker are available | Browser reports a valid manifest and registered service worker in HTTPS secure context. |
| D02 | Positive | Start a creator financial action while offline | Action is saved in IndexedDB as pending; visible pending/last-sync state is shown. |
| D03 | Positive | Restore connectivity | Queue syncs in creation order; entry reaches server once and pending marker clears. |
| D04 | Negative | Queue replay with a duplicate client id | Idempotency prevents a duplicate server entry. |
| D05 | Negative | Logout while queue is non-empty | App warns rather than silently discarding queue. |

## 6. Acceptance Gate

Pass only if all critical positive and security cases pass. Raw command output, test logs, and non-sensitive evidence are collected with zero exposed secrets.