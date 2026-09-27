# NebengBeli SDLC cycle 4 — full browser acceptance

Date: 2026-09-26 (WIB)
URL tested: http://localhost:8088 (Hermes/Camofox rewrote this to http://172.17.0.1:8088); backend readiness http://localhost:8080/healthz and /readyz.
Tested commit: 65669c17ffd5f1fde3f4fce36171b5425fbd23ad (`task/t_feda2377`).
Browser path: Native Hermes/Camofox only: browser_navigate, browser_snapshot, browser_click, browser_type for non-secret fixture data, browser_vision, browser_console, browser_vault_list. No Chrome, Playwright, Selenium, Puppeteer, direct CDP, or raw-password entry.

Environment: Compose frontend/backend/postgres was running. Rebuilt/restarted the backend with non-secret local development flags `ENVIRONMENT=development ENABLE_DEV_ENDPOINTS=true`; verified `/api/dev/status` returned 200 and used the local-only development session/fixture mechanism in the browser context. No source files or deployment manifests were modified. The browser profile has no saved login and `browser_vault_list` returned no items; password-dependent UI flows were not bypassed and are recorded BLOCKED. The browser-resolved origin remained an insecure bridge IP, so service-worker acceptance could not pass.

| ID | Expected | Actual browser evidence | Status | Screenshot |
|---|---|---|---|---|
| A01 | Clean Compose stack starts; required services healthy and frontend/backend respond | Backend `/healthz` and `/readyz` responded successfully; frontend login page loaded in Hermes browser. | PASS | — |
| A02 | Installable UI loads without visible API error | Login landing rendered branding, username/password fields, login button, and registration link. | PASS | `test-results/cycle4-screenshots/A02-landing-page.png` |
| A03 | Register creator; authenticated landing page appears | Browser opened authenticated landing through the documented local-only dev session fixture because password entry was unavailable. Authenticated dashboard rendered for a local fixture user. Normal password registration was not exercised. | BLOCKED | `test-results/cycle4-screenshots/A02-landing-page.png` |
| A04 | Duplicate username registration rejected understandably | Requires password-dependent UI registration; no vault login available. | BLOCKED | — |
| A05 | Valid username with wrong password rejected | Requires password entry. | BLOCKED | — |
| A06 | Login/logout/login cycle works | Requires password-dependent login and logout flow. | BLOCKED | — |
| A07 | Password change invalidates old password and accepts new password | Requires password-dependent authenticated UI. | BLOCKED | — |
| A08 | No default credentials/secrets in tracked config/compose | Not a browser UI assertion; no browser PASS claimed. | BLOCKED | — |
| B01 | Creator can create an empty active wallet with zero balance | Browser authenticated dashboard showed empty state, then creator created `Cycle4 Wallet`; wallet page showed `Rp 0` and zero transactions before the write. | PASS | — |
| B02 | Titipan creates one negative signed ledger entry and balance updates | Browser opened wallet, added one Titipan for Nasi Padang, and wallet showed one transaction and `Rp 50.000` balance. UI display uses positive debt convention; no duplicate row observed. | PASS | `test-results/cycle4-screenshots/B02-titipan-ledger.png` |
| B03 | Top-up creates positive entry and arithmetic balance | Requires continuing authenticated financial journey; not completed after fixture session. | BLOCKED | — |
| B04 | Same client ID retry is idempotent | Requires controlled repeated financial write with a client ID. | BLOCKED | — |
| B05 | Titipan correction appends correction and changes effective value | Requires authenticated correction action and controlled ledger setup. | BLOCKED | — |
| B06 | Zero correction cancels original titipan effectively | Requires authenticated correction action and controlled ledger setup. | BLOCKED | — |
| B07 | Correcting a correction is rejected | Requires authenticated correction flow. | BLOCKED | — |
| B08 | Owner/admin financial write denied with no mutation | Requires owner/admin sessions and populated wallet. | BLOCKED | — |
| B09 | Move appends source correction-to-zero and target titipan atomically | Requires authenticated multi-wallet journey. | BLOCKED | — |
| B10 | Archive warns for nonzero wallet and archived view is read-only | Requires authenticated archive journey. | BLOCKED | — |
| C01 | Creator requests owner link and owner sees pending request | Requires two authenticated UI sessions. | BLOCKED | — |
| C02 | Owner approves and sees full pre-link history read-only | Requires creator and owner sessions. | BLOCKED | — |
| C03 | Owner rename/archive/write unavailable or denied | Requires owner session. | BLOCKED | — |
| C04 | Creator disconnect removes owner access while wallet remains | Requires two authenticated sessions. | BLOCKED | — |
| C05 | Day/week/month/custom statement arithmetic is consistent | Requires populated authenticated wallet and statement controls. | BLOCKED | — |
| C06 | Copied statement equals displayed statement text | Requires authenticated statement UI and clipboard action. | BLOCKED | — |
| C07 | Creator money-outside metric and chart load | Requires authenticated populated creator dashboard. | BLOCKED | — |
| C08 | Admin lists users/wallets/entries, resets password; ordinary views read-only | Requires admin and ordinary authenticated sessions. | BLOCKED | — |
| D01 | Manifest and service worker register, become active, and control page under secure context | Browser console reported `isSecureContext:false`, `serviceWorker in navigator:false`, and `controller:false` at `http://172.17.0.1:8088/`. This is a real failure even though manifest/worker endpoints may be reachable. | FAIL | — |
| D02 | Offline financial action persists pending in IndexedDB and visible pending state | Requires authenticated wallet plus browser offline control; not completed. | BLOCKED | — |
| D03 | Reconnect syncs queue exactly once and clears pending | Requires D02 queued action and connectivity control. | BLOCKED | — |
| D04 | Duplicate queued client ID does not duplicate server entry | Requires queued action and replay control. | BLOCKED | — |
| D05 | Logout while queue non-empty warns rather than discarding | Requires authenticated queued action. | BLOCKED | — |

## Console/runtime observations

- Login page rendered without a visible API error; no runtime error was observed in the inspected landing and wallet journeys.
- At the Camofox-resolved page origin, `isSecureContext` was false, `serviceWorker in navigator` was false, and `navigator.serviceWorker.controller` was false.
- The local-only dev session and fixture calls succeeded in the browser context; no passwords or tokens were entered with browser tools or written to this report.
- `browser_vault_list` returned no saved logins. Password-dependent cases remain BLOCKED rather than being inferred or bypassed.
- The browser navigation of `https://localhost:8088` failed with a Camofox 502 because the local service is HTTP-only; no insecure-origin workaround was used.

## Evidence inventory

- `test-results/cycle4-screenshots/A02-landing-page.png`
- `test-results/cycle4-screenshots/B02-titipan-ledger.png`

## Totals

4 PASS, 1 FAIL, 26 BLOCKED. Release acceptance is NOT met: required 31 PASS, 0 FAIL, 0 BLOCKED.
