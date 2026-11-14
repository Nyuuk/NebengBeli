# Mobile recap modal layout — v1.0

Owner/technical approver: default. Baseline: 31612272874d880faf66bd12be75b085f9a6ad5c (PR14, shared tab fix reviewed by QA run233). Product approval: Nyuuk explicitly said “fixing sekalian aja” in Discord thread1571167689198805022 in response to the remaining 320px date/footer clipping. This follow-up supersedes the prior tab contract's no-broader-modal-layout exclusion ONLY for the date row and action footer described here. All NB-TABS-1..4 invariants remain mandatory; no redesign of other pages.

## Acceptance
- NB-RECAP-1: At smartphone widths320/360/390/430 CSS pixels, both Custom date labels (Tanggal Mulai, Tanggal Selesai), native date values and calendar affordances fit their controls without truncation/overlap. Inputs remain editable and date filtering remains unchanged. Prefer responsive stacking at narrow sizes, not smaller illegible text.
- NB-RECAP-2: All footer actions Tutup, Bagikan, Salin Teks and icons/labels fit inside the dialog and viewport without horizontal scrolling, clipping or overlap. Controls remain keyboard reachable and working with existing close/share/copy success and fallback behavior. Responsive stacking/wrapping is allowed; no removal/renaming of actions.
- NB-RECAP-3: Dialog content remains vertically scrollable at short smartphone height (320x568 at minimum); date controls and actions stay reachable. At desktop1280px no clipping or unnecessary narrow-layout regression. Preserve existing shared tabs and all four tab consumers, recap math, API/auth and business behavior.
- NB-RECAP-4: Add browser regressions that FAIL on baseline for actual date/footer containment/clipping (DOM presence alone insufficient), and PASS on final code at320/360/390/430/1280 and short height. Use real RekapTextModal through existing local fixture; preserve existing all-consumer tab browser cases. Unit tests cover actions/date editing; no weakened assertions or sleep-based hiding.

## Validation and boundaries
Use existing frontend and playwright lockfiles/dependencies and existing mobile-tabs.config.ts + local-tests/mobile-tabs.local.spec.ts + frontend/src/test/mobile-tabs-browser. Local/mock Chromium evidence is not deployed/full-stack/physical-device testing. Fixture browser config must remain separate from production route/build. Run focused unit, frontend build, Playwright typecheck, complete local layout browser suite and frontend regression suite once on final code (workers1). Save sanitized RED/GREEN evidence outside Git; freeze GREEN then commit/handoff immediately.

Authorized changes: RekapTextModal layout and focused unit/browser regression tests; fixture changes only if needed. No backend, auth/API, dependency upgrades, unrelated modal/page redesign, production access or deployment changes. Use one frontend-engineer writer and independent qa review; default integrates reviewed SHA into existing fix/mobile-scrollable-tabs and updates existing PR14. Scoped local task/contract/integration commits and feature-branch push are authorized by follow-up PR request; no main merge, tags, deploy, force push or unrelated changes.

confirmation_mode: ambiguous_requirements_only (inherited explicit user choice).
implementation_harness: hermes-direct (inherited explicit user choice); no external coding CLI.
