# NebengBeli SDLC cycle 3 — full browser E2E acceptance

Date: 2026-09-26 (WIB)
URL tested: http://localhost:8088 (Camofox resolved to http://172.17.0.1:8088); backend readiness URLs http://localhost:8080/healthz and /readyz.
Tested commit: a37532fee9e654068228fb54f0934ae97a88d2ea.
Browser path: Native Hermes/Camofox tools only: browser_navigate, browser_snapshot, browser_click, browser_vision, browser_console, browser_vault_list/save_login. No Chrome, Playwright, Selenium, Puppeteer, or direct CDP.

Important limitation: browser_vault_list returned no saved login and browser_vault_save_login returned prompt_unavailable in this headless session. Per policy, no password was entered in chat or with browser_type. Authenticated/password-dependent UI journeys therefore remain BLOCKED, not assumed to pass. The local-only dev fixture route was initially 404 because the running Compose backend was production; a temporary local override was used to restart the backend with development endpoints, then restored. No application source was modified.

| ID | Expected | Actual browser evidence | Status | Screenshot |
|---|---|---|---|---|
| A01 | Compose services healthy and frontend/backend respond | Browser /healthz returned {"status":"alive"}; /readyz returned {"db_ping":"ok","status":"ready"}; frontend login UI loaded. | PASS | — |
| A02 | Installable UI loads without visible API error | Login UI rendered branding, username/password fields, login button and registration link; console error probe returned no errors. | PASS | `test-results/cycle3-screenshots/A02-landing-page.png` |
| A03 | Register creator and authenticated landing appears | Registration page was opened and visually verified. Actual password-dependent registration and authenticated landing could not be completed without vault prompt. | BLOCKED | `test-results/cycle3-screenshots/A03-registration-page.png` |
| A04 | Duplicate username rejected | Requires password-dependent registration. | BLOCKED | — |
| A05 | Wrong password rejected | Requires password entry. | BLOCKED | — |
| A06 | Login/logout/login cycle | Requires password/session setup. | BLOCKED | — |
| A07 | Password change invalidates old password | Requires authenticated password UI and password entry. | BLOCKED | — |
| A08 | No default credentials/secrets | Not a browser UI assertion; no browser PASS claimed. | BLOCKED | — |
| B01 | Empty creator wallet has zero balance | Requires authenticated creator session and wallet UI. | BLOCKED | — |
| B02 | Titipan creates one negative entry | Requires authenticated wallet UI. | BLOCKED | — |
| B03 | Top-up creates positive entry and arithmetic balance | Requires authenticated wallet UI. | BLOCKED | — |
| B04 | Same client ID is idempotent | Requires authenticated financial write and retry. | BLOCKED | — |
| B05 | Titipan correction appends and changes effective value | Requires authenticated ledger UI. | BLOCKED | — |
| B06 | Zero correction cancels titipan | Requires authenticated ledger UI. | BLOCKED | — |
| B07 | Correcting correction is rejected | Requires authenticated ledger UI. | BLOCKED | — |
| B08 | Owner/admin financial write denied | Requires owner/admin authenticated sessions. | BLOCKED | — |
| B09 | Move is atomic source correction + target titipan | Requires authenticated creator wallet UI. | BLOCKED | — |
| B10 | Nonzero archive warns and archived wallet is read-only | Requires authenticated wallet UI. | BLOCKED | — |
| C01 | Creator requests owner link | Requires two authenticated UI sessions. | BLOCKED | — |
| C02 | Owner approves and sees history read-only | Requires creator and owner sessions. | BLOCKED | — |
| C03 | Owner rename/archive/write unavailable or denied | Requires owner session. | BLOCKED | — |
| C04 | Creator disconnect removes owner access | Requires creator and owner sessions. | BLOCKED | — |
| C05 | Statement balances satisfy start + total = end | Requires authenticated populated wallet. | BLOCKED | — |
| C06 | Copied statement equals displayed text | Requires authenticated statement UI and clipboard action. | BLOCKED | — |
| C07 | Creator money-outside metric and chart | Requires authenticated populated creator dashboard. | BLOCKED | — |
| C08 | Admin views/reset and ordinary read-only views | Requires admin and ordinary authenticated sessions. | BLOCKED | — |
| D01 | Valid manifest and registered/active/controlling SW | Manifest JSON and service-worker.js were reachable and rendered. Browser reported `isSecureContext:false`, `serviceWorker:false`, and `controller:false` at the Camofox-resolved `http://172.17.0.1:8088` origin. Reachability is not registration/control. | FAIL | — |
| D02 | Offline financial action persists pending in IndexedDB | Requires authenticated wallet and browser offline control. | BLOCKED | — |
| D03 | Reconnect syncs exactly once and clears pending | Requires queued authenticated action and connectivity control. | BLOCKED | — |
| D04 | Duplicate queued client ID does not duplicate server entry | Requires queued authenticated action and replay. | BLOCKED | — |
| D05 | Logout with non-empty queue warns | Requires authenticated queued action. | BLOCKED | — |

## Console/runtime observations

- Login page console probe: `errors: []`.
- At the actual Camofox-resolved page origin, `isSecureContext` was false, `serviceWorker in navigator` was false, and `navigator.serviceWorker.controller` was false.
- Manifest and worker source endpoints were reachable, but this does not satisfy D01 registration/active/controller acceptance.
- Browser console evaluation intermittently returned a Camofox `/evaluate` 500 during the local fixture probe; navigation and snapshots continued to work.
- No credentials, tokens, passwords, database URLs, or secrets are present in this report or screenshot filenames.

## Totals

2 PASS, 1 FAIL, 28 BLOCKED. Release gate is not met: required 31 PASS, 0 FAIL, 0 BLOCKED.
