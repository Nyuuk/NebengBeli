# NebengBeli local E2E test plan

## Scope and environment

- Target: merged `main` branch of `Nyuuk/NebengBeli` at the local checkout.
- Stack: Docker Compose (frontend, backend, PostgreSQL, reverse proxy if present).
- Browser: Hermes Browser profile only; do not substitute Playwright, Selenium, or a system browser.
- Evidence: screenshots for each major user journey and every failed case; screenshots must contain no passwords, tokens, database URLs, or other credentials.
- Roles: two ordinary users (creator and owner) plus one CLI-created admin.

## Preconditions

1. Create a non-committed local runtime environment with unique random secrets for JWT and PostgreSQL.
2. Run `docker compose config`, build images, start the stack, and verify service health/readiness.
3. Create the admin exclusively with the documented CLI command, providing an explicit password. No default credentials may exist.
4. Register creator and owner independently in the UI.

## Test cases

### A. Platform and authentication

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| A01 | Positive | Compose stack starts from a clean local environment | Required services are healthy and frontend/backend respond. |
| A02 | Positive | Open the application in a browser | Installable PWA UI loads without a visible API error. |
| A03 | Positive | Register a creator with username/password | Registration succeeds; authenticated creator landing page appears. |
| A04 | Negative | Register the same username again | Request is rejected with an understandable validation/error state. |
| A05 | Negative | Login with valid username and wrong password | Login is rejected; no authenticated page is shown. |
| A06 | Positive | Login/logout/login cycle | Session cookie works; logout removes access; re-login restores access. |
| A07 | Positive | Change own password, then use the old password | Existing session is revoked/old password is rejected; new password authenticates. |
| A08 | Security | Inspect tracked config/template files and compose config | No default admin password, JWT secret, DB password, or auto-seeded admin credential exists. |

### B. Wallet and immutable ledger

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

### C. Linking, roles, statements, insights

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

### D. PWA and offline queue

| ID | Type | Scenario | Expected result |
|---|---|---|---|
| D01 | Positive | Manifest and service worker are available | Browser reports a valid manifest and registered service worker. |
| D02 | Positive | Start a creator financial action while offline | Action is saved in IndexedDB as pending; visible pending/last-sync state is shown. |
| D03 | Positive | Restore connectivity | Queue syncs in creation order; entry reaches server once and pending marker clears. |
| D04 | Negative | Queue replay with a duplicate client id | Idempotency prevents a duplicate server entry. |
| D05 | Negative | Logout while queue is non-empty | App warns rather than silently discarding queue. |

## Acceptance gate

Pass only if all critical positive and security cases pass. A failed or unimplemented offline/browser case must be recorded as a real limitation, not converted to a pass. Attach raw command output, test result log, and screenshots to the final report.