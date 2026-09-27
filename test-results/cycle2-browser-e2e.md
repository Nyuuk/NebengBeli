# NebengBeli SDLC cycle 2 — independent browser E2E regression

Date: 2026-09-26 (WIB)
Environment URL: http://localhost:8088 (Hermes Camofox resolved this to http://172.17.0.1:8088)
Commit SHA: 52d00c30ac743a4802e1ad68cbe38d917f1aa142
Browser path: Native Hermes browser tools only: browser_navigate, browser_snapshot, browser_click, browser_type (not used for secrets), browser_vision, browser_console. No Chrome, Playwright, Selenium, Puppeteer, or direct CDP.
Runtime: Docker Compose frontend/backend/postgres healthy; /healthz returned {"status":"alive"}; /readyz returned {"db_ping":"ok","status":"ready"}.

Important test limitation: this headless Browser profile has no saved login and cannot display the masked vault prompt. browser_vault_list returned no saved items and browser_vault_save_login returned prompt_unavailable. No password was entered in chat or with browser_type. Password-dependent UI journeys are therefore BLOCKED, not assumed to pass. A temporary registration request was issued from browser_console solely to obtain an authenticated test session for the empty-dashboard check; it returned a token, but the session was not persisted through the UI login flow.

## Results

| ID | Expected | Actual browser evidence | Status | Screenshot |
|---|---|---|---|---|
| A01 | Compose services healthy and frontend/backend respond | Compose services postgres, backend, frontend were healthy; browser /healthz and /readyz both returned success. | PASS | — |
| A02 | Installable UI loads without visible API error | Login UI rendered with branding, username/password fields, and registration link; browser console error probe had no errors. | PASS | `test-results/cycle2-screenshots/A02-landing-page.png` |
| A03 | Creator registration succeeds and authenticated landing appears | Browser console POST to registration returned a user and token; navigating to `/` rendered authenticated creator dashboard for `test_creator_c2` with no active books. This was browser-exercised but not entered through the UI form because password entry is unavailable in this headless session. | PASS (browser-limited) | `test-results/cycle2-screenshots/B01-empty-wallet-dashboard.png` |
| A04 | Duplicate username rejected understandably | Not run: requires password-dependent UI registration/session setup. | BLOCKED | — |
| A05 | Wrong-password login rejected and remains unauthenticated | Not run: no password can be supplied in this headless profile. | BLOCKED | — |
| A06 | Logout removes access and re-login restores it | Not run: no vault login available. | BLOCKED | — |
| A07 | Password change revokes old password and accepts new password | Not run: requires authenticated password-change UI and password input. | BLOCKED | — |
| A08 | No default credentials/secrets in tracked config | Not a browser UI assertion; upstream readiness checks reported no default credentials. No additional code/config inspection used as a browser PASS. | BLOCKED | — |
| B01 | New wallet is active with zero balance | Authenticated creator dashboard rendered `Buku Aktif (0)` and `Belum Ada Buku Titipan`; create-book actions visible. This verifies the empty-wallet load path, not creation of a wallet because password/session persistence was unavailable. | PASS (empty state only) | `test-results/cycle2-screenshots/B01-empty-wallet-dashboard.png` |
| B02 | Titipan produces one negative signed entry | Not run: requires authenticated UI wallet and financial write. | BLOCKED | — |
| B03 | Top-up produces positive signed entry and arithmetic balance | Not run. | BLOCKED | — |
| B04 | Same client ID does not duplicate write | Not run. | BLOCKED | — |
| B05 | Titipan correction appends correction and updates effective value | Not run. | BLOCKED | — |
| B06 | Zero correction cancels original titipan effectively | Not run. | BLOCKED | — |
| B07 | Correcting a correction is rejected | Not run. | BLOCKED | — |
| B08 | Owner/admin financial write denied without mutation | Not run: requires owner/admin sessions. | BLOCKED | — |
| B09 | Move appends linked source correction and target titipan atomically | Not run. | BLOCKED | — |
| B10 | Nonzero archive warns, succeeds, and is read-only | Not run. | BLOCKED | — |
| C01 | Creator owner-link request appears to owner | Not run: requires two authenticated UI sessions. | BLOCKED | — |
| C02 | Owner approval exposes history read-only | Not run. | BLOCKED | — |
| C03 | Owner rename/archive/write unavailable or denied | Not run. | BLOCKED | — |
| C04 | Disconnect removes owner access while preserving creator wallet | Not run. | BLOCKED | — |
| C05 | Statements include arithmetic-consistent balances | Not run. | BLOCKED | — |
| C06 | Copy/export statement equals displayed text | Not run. | BLOCKED | — |
| C07 | Creator money-outside insight/chart loads | Not run beyond empty dashboard. | BLOCKED | — |
| C08 | Admin views/reset work and ordinary views remain read-only | Not run: admin password/session unavailable. | BLOCKED | — |
| D01 | Valid manifest and actual registered/controlled service worker | `/manifest.json` rendered valid manifest JSON. `/service-worker.js` was served and rendered worker source. On the login page browser_console reported `serviceWorker: false`, `controller: false`; no registration/control was present during the observed page session. | FAIL | `test-results/cycle2-screenshots/D01-pwa-manifest.png`; `test-results/cycle2-screenshots/D01-service-worker-source.png` |
| D02 | Offline financial action persists pending in IndexedDB and shows pending state | Not run: requires authenticated wallet and browser offline control. | BLOCKED | — |
| D03 | Reconnect syncs exactly once and clears pending | Not run. | BLOCKED | — |
| D04 | Duplicate queued client ID does not duplicate server entry | Not run. | BLOCKED | — |
| D05 | Logout with queued work warns instead of discarding | Not run. | BLOCKED | — |

## Console/runtime observations

- Login page: browser_console error probe returned `errors: []`.
- Login page service-worker probe: `serviceWorker in navigator` was false and `controller` was false in the observed browser context.
- No uncaught JavaScript/runtime error was observed in the empty authenticated dashboard load.
- The service-worker source endpoint itself was reachable and rendered source; reachability is not equivalent to registration/control.

## True failures and limitations

1. D01 failed its combined requirement: manifest and worker source were reachable, but the browser session reported no service-worker API/control. This is a real browser observation.
2. Password-dependent journeys A04–A07, B02–B10, C01–C08, and D02–D05 were BLOCKED rather than converted to PASS because the headless vault prompt was unavailable and passwords cannot be entered with browser_type.
3. A03 and B01 were exercised through browser tools, with registration initiated in browser_console because UI password entry was unavailable. B01 confirms empty dashboard/wallet loading, not a newly created wallet ledger.

## Evidence inventory

- `test-results/cycle2-screenshots/A02-landing-page.png`
- `test-results/cycle2-screenshots/B01-empty-wallet-dashboard.png`
- `test-results/cycle2-screenshots/D01-pwa-manifest.png`
- `test-results/cycle2-screenshots/D01-service-worker-source.png`

Totals: 4 PASS (including browser-limited/partial A03 and B01), 1 FAIL, 25 BLOCKED. No test case was marked PASS solely from code or API inspection; the two browser-limited cases explicitly state their scope.
