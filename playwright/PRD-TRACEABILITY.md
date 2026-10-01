# NebengBeli PRD Test Traceability Matrix

This document maps the verified 29-test regression baseline to the core requirements in [`docs/PRD.md`](../docs/PRD.md) (F1–F11 and non-functional / security / ledger rules). All 29 tests are active and executable without skips or fixmes. Known uncovered PRD edge cases are documented below.

---

## Traceability Matrix

| PRD Section | PRD Lines | Requirement Summary | Spec File | Test Title | Test Layer | Current State |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F1. Sesi Belanja** | L59–69 | Multi-row shopping session form, autocomplete active wallets, item suggestion with last price, live total calculation, editable occurred_at, atomic Save All | `f1-shopping-session.spec.ts` | `multi-row shopping session records multiple entries atomically with total calculation and autocomplete` | E2E / UI | ACTIVE / Passing |
| **F1. Sesi Belanja** | L67 | Form content preserved as durable draft across page refresh / unmount | `f1-shopping-session.spec.ts` | `durable draft preserves unsubmitted shopping session rows in local storage/IndexedDB across reload` | UI | ACTIVE / Passing |
| **F1. Sesi Belanja** | L66 | Simpan Semua executes batch in 1 single database transaction | `f1-shopping-session.spec.ts` | `backend batch entry endpoint creates entries atomically in 1 database transaction` | API | ACTIVE / Passing |
| **F2. Pencatatan Tunggal** | L70–74 | Single titipan entry & single top-up entry with optional note from wallet detail | `f2-single-entry.spec.ts` | `creator records single titipan and single top-up with optional note from wallet detail page` | E2E / UI | ACTIVE / Passing |
| **F2. Pencatatan Tunggal** | L70–74 | Backend accepts single entries with signed amounts and notes | `f2-single-entry.spec.ts` | `backend accepts single titipan and top-up with signed amounts and optional notes` | API | ACTIVE / Passing |
| **F3. Transaksi Koreksi** | L75–83 | Correction with target nominal, delta calculation, quick reasons, cancellation to 0, effective presentation | `f3-corrections-and-moves.spec.ts` | `creator performs correction to target nominal, cancellation to 0, and views effective history` | E2E / UI | ACTIVE / Passing |
| **F3. Transaksi Koreksi** | L84 | "Pindahkan ke dompet lain" action atomically creates reversal to 0 in origin and new titipan in target | `f3-corrections-and-moves.spec.ts` | `action "Pindahkan ke dompet lain" atomically reverses source entry and creates new entry in target wallet` | E2E / UI | ACTIVE / Passing |
| **F3. Transaksi Koreksi** | L77–78 | Creator-only write authorization & disallow correcting a correction | `f3-corrections-and-moves.spec.ts` | `disallow non-creator from creating corrections and disallow correcting a correction` | API | ACTIVE / Passing |
| **F4. Rekap Teks** | L86–94 | Export to text with date presets (today/week/month/custom), balance invariant check, clipboard copy | `f4-text-recap.spec.ts` | `creator generates text recap for all presets, verifies balance invariant, and copies to clipboard` | E2E / UI | ACTIVE / Passing |
| **F4. Rekap Teks** | L88 | Linked owner can access and generate text recap for their wallet | `f4-text-recap.spec.ts` | `linked owner can also access and generate text recap for their wallet` | E2E / UI | ACTIVE / Passing |
| **F5. Manajemen Dompet** | L95–101 | Wallet creation, rename, archive with non-zero warning, unarchive, read-only archive tab | `f5-wallet-management.spec.ts` | `creator creates wallet, renames it, archives with non-zero warning, and unarchives` | E2E / UI | ACTIVE / Passing |
| **F5. Manajemen Dompet** | L99–100 | Backend prevents adding entries to archived wallet | `f5-wallet-management.spec.ts` | `backend prevents creating entries in an archived wallet` | API | ACTIVE / Passing |
| **F6. Linking Pemilik** | L102–110 | Link request, reject, re-link, approve, full historical view, creator unlink | `f6-wallet-linking.spec.ts` | `complete lifecycle: link request, rejection, re-request, approval, history visibility, and creator unlink` | E2E / UI | ACTIVE / Passing |
| **F7. Beranda Pemilik** | L111–117 | Grouping per creator, subtotals per creator, no cross-creator total, tab switching | `f7-dashboard-and-home.spec.ts` | `owner dashboard groups wallets per creator with subtotals and no cross-creator total` | E2E / UI | ACTIVE / Passing |
| **F8. Insight Pembuat** | L118–123 | "Total uang saya yang masih di luar", balance charts, outstanding calculation | `f8-creator-insights.spec.ts` | `creator dashboard displays total money outside and balance statistics` | E2E / UI | ACTIVE / Passing |
| **F8. Insight Pembuat** | L118–123 | Backend insights endpoint aggregation | `f8-creator-insights.spec.ts` | `backend insights endpoint returns correct aggregations for active creator wallets` | API | ACTIVE / Passing |
| **F9. Admin** | L124–132 | Admin read-only dashboard metrics, user list, wallet list, transactions, password reset | `f9-admin-views.spec.ts` | `admin views read-only metrics, user list, wallet list, transactions, and resets user password` | E2E / UI | ACTIVE / Passing |
| **F9. Admin** | L124 | Regular users blocked from admin endpoints (403 Forbidden) | `f9-admin-views.spec.ts` | `regular users are strictly forbidden from accessing admin endpoints` | API | ACTIVE / Passing |
| **F10. Akun & Auth** | L133–139 | Registration, login, self password change, token_version session revocation, logout | `f10-auth-security.spec.ts` | `user registers, logs in, changes self password, and old session is revoked` | E2E / UI | ACTIVE / Passing |
| **F10. Akun & Auth** | L138 | Admin account only created via CLI, not via public registration | `f10-auth-security.spec.ts` | `registration cannot create admin role directly` | API | ACTIVE / Passing |
| **F10. Akun & Auth** | L191–193 | Token renewal endpoint | `f10-auth-security.spec.ts` | `token renewal succeeds with valid active token` | API | ACTIVE / Passing |
| **F10. Keamanan** | L200 | Input escaping across item names, wallet names, and notes against XSS | `f10-auth-security.spec.ts` | `input text fields escape HTML/script payloads safely without executing XSS` | UI | ACTIVE / Passing |
| **F11. Offline & Sync** | L140–152 | Offline entry recording, IndexedDB storage with client_id, pending indicators, auto-sync | `f11-offline-pwa-sync.spec.ts` | `offline entries queued in IndexedDB with client_id, display pending tags, and sync automatically on reconnect` | E2E / UI | ACTIVE / Passing |
| **F11. Offline & PWA** | L213–220 | Manifest link and Service Worker support | `f11-offline-pwa-sync.spec.ts` | `service worker and PWA manifest are present on the client` | UI | ACTIVE / Passing |
| **F11. Offline & Sync** | L145 | Duplicate client_id rejection / idempotency | `f11-offline-pwa-sync.spec.ts` | `server rejects duplicate client_id idempotently without double counting` | API | ACTIVE / Passing |
| **Non-Functional** | L77–78 | Probes /healthz and /readyz | `nonfunctional-ledger-security.spec.ts` | `health and readiness probes respond successfully` | API | ACTIVE / Passing |
| **Non-Functional** | L51–52 | No debt limit: wallet allows negative balances without blocking transactions | `nonfunctional-ledger-security.spec.ts` | `no debt limit: wallet allows negative balances without blocking transactions` | API | ACTIVE / Passing |
| **Non-Functional** | L171–182 | Authorization matrix for unauthenticated requests | `nonfunctional-ledger-security.spec.ts` | `authorization matrix: unauthorized caller is blocked with 401 across all protected routes` | API | ACTIVE / Passing |
| **Non-Functional** | L206 | Signed BIGINT nominal precision up to millions | `nonfunctional-ledger-security.spec.ts` | `signed BIGINT precision: ledger handles exact integer rupiah amounts up to millions` | API | ACTIVE / Passing |

---

## Known Uncovered PRD Edge Cases

While the 29 tests provide a comprehensive functional baseline, the following specific edge cases from the PRD are acknowledged as not yet fully covered in this suite:
- **F7**: Multi-creator complex hierarchy edge cases and dynamic subtotal re-aggregations.
- **F8**: Historical creator trends spanning multi-month boundaries and granular debt aging.
- **F11**: Network interruption during middle of sync transaction and client-side replay rollback on fatal HTTP 500 server rejection.
- **Security & Concurrency**: Chaos-testing atomic rollback under mid-transaction database disconnects and extreme concurrent link request race conditions.

---

## Verification Rules

1. **No skipped tests (`test.skip`) or test fixes (`test.fixme`)** are permitted for unimplemented or failing requirements. Every PRD requirement in this baseline is an executable active test.
2. All tests run in pure **Chromium** mode matching standard browser engines.
3. Every test generates isolated user accounts and unique wallet records to prevent crosstalk.
