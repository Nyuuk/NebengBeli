# NebengBeli Browser E2E Results

Date: 2026-09-26
Target: http://localhost:8088 (Hermes Camofox rewrote to http://172.17.0.1:8088)
Browser path: Hermes native browser tools only (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_vision`, `browser_console`).

Passwords were entered only through browser interaction and are not recorded here. Evidence screenshots contain masked password fields where applicable.

| ID | Name | Expected | Actual | Status | Screenshot path |
|---|---|---|---|---|---|
| A01 | Compose stack starts | Services healthy and frontend/backend respond | Upstream readiness report confirms postgres/backend/frontend healthy; frontend reachable on port 8088 because port 80 was occupied | PASS | — |
| A02 | Open application | Installable UI loads without visible API error | Login UI loaded; no visible API error or broken layout | PASS | `test-results/screenshots/A02-landing-page.png` |
| A03 | Register creator | Registration succeeds and authenticated landing appears | New creator registration succeeded; authenticated dashboard displayed creator identity | PASS | `test-results/screenshots/A03-creator-registered.png` |
| A04 | Duplicate registration | Understandable rejection | Existing username rejected with `username already exists` | PASS | — |
| A05 | Invalid login | Rejected with no authenticated page | Login remained unauthenticated and displayed `invalid username or password` | PASS | `test-results/screenshots/A05-invalid-login.png` |
| A06 | Login/logout/login | Logout removes access and re-login restores it | Not completed: password vault unavailable in headless session; no password was persisted | FAIL | — |
| A07 | Password change effect | Old password rejected, new password authenticates | Not executed; requires authenticated password-change flow | FAIL | — |
| A08 | Security/config inspection | No default credentials/secrets tracked | Upstream readiness report says checks passed; no browser UI verification | PASS | — |
| B01 | Create wallet | Active zero-balance wallet appears | Wallet created and detail page displayed Rp 0, but UI showed technical alert `K.entries is null` | FAIL | `test-results/screenshots/B01-wallet-created.png` |
| B02 | Add titipan | Negative signed entry and negative balance | Not executed because wallet page exposed runtime error and subsequent session was lost | FAIL | — |
| B03 | Add top-up | Positive entry and computed balance | Not executed | FAIL | — |
| B04 | Idempotent duplicate write | Retry does not duplicate entry | Not executed | FAIL | — |
| B05 | Correct titipan | Correction appended; effective value/balance correct | Not executed | FAIL | — |
| B06 | Cancel titipan | Zero effective value via correction | Not executed | FAIL | — |
| B07 | Correct correction rejection | Request rejected | Not executed | FAIL | — |
| B08 | Owner/admin write denied | No mutation | Not executed | FAIL | — |
| B09 | Move entry | Atomic source correction and target entry | Not executed | FAIL | — |
| B10 | Archive wallet | Warning, archive success, read-only archive | Not executed | FAIL | — |
| C01 | Request owner link | Owner sees pending request | Not executed | FAIL | — |
| C02 | Approve link | Owner sees pre-link history read-only | Not executed | FAIL | — |
| C03 | Owner mutation denied | Rename/archive/write unavailable or denied | Not executed | FAIL | — |
| C04 | Disconnect owner | Owner loses access; wallet remains | Not executed | FAIL | — |
| C05 | Statement | Start + period total = end | Not executed | FAIL | — |
| C06 | Copy statement | Copied/exported text matches statement | Not executed | FAIL | — |
| C07 | Creator insights | Money-outside and wallet chart load | Not executed | FAIL | — |
| C08 | Admin views/reset | Admin can inspect and reset; ordinary data read-only | Not executed | FAIL | — |
| D01 | Manifest and service worker | Valid manifest and registered service worker | `/manifest.json` returned valid install metadata. `navigator.serviceWorker` was present but false, so service-worker requirement was not met | FAIL | `test-results/screenshots/D01-pwa-manifest.png` |
| D02 | Offline pending action | IndexedDB pending action and visible pending state | Not executed | FAIL | — |
| D03 | Online sync | Queue syncs once and pending clears | Not executed | FAIL | — |
| D04 | Offline duplicate protection | Duplicate client ID does not duplicate server entry | Not executed | FAIL | — |
| D05 | Logout with queue | Warning instead of queue discard | Not executed | FAIL | — |

## Defects and limitations observed

1. Wallet detail load displayed a raw technical alert: `K.entries is null` immediately after wallet creation. This is a real UI/runtime defect and blocked reliable ledger journey continuation.
2. `navigator.serviceWorker` evaluated to `false` on the login page. Direct navigation to `/service-worker.js` returned the app 404 page, confirming that no service worker is registered/served. Manifest availability alone passed, but the combined D01 service-worker requirement failed.
3. Headless browser session was reset during navigation. The browser vault had no saved local login and could not prompt to save one in this unattended session; therefore password-dependent journeys were not assumed to pass.

## Evidence inventory

- `test-results/screenshots/A02-landing-page.png`
- `test-results/screenshots/A03-creator-registered.png`
- `test-results/screenshots/A05-invalid-login.png`
- `test-results/screenshots/B01-wallet-created.png`
- `test-results/screenshots/D01-pwa-manifest.png`
- `test-results/screenshots/D01-service-worker-404.png`
