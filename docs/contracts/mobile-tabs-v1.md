# Mobile tab overflow fix — contract v1.0

Owner: default (technical); product request: Nyuuk in Discord thread 1571167689198805022.
Source baseline: d9b36b55d4eb2f9c318a940eb58034a625f083da.
Approval: user explicitly requested fixing smartphone tab scrolling and applying it to every equivalent UI/component, then opening a PR to main. Technical approval: default inspected all four MUI Tabs usages and confirmed inconsistent overflow configuration. This document formalizes that request without adding product behavior.

## Scope and invariants
- NB-TABS-1: At 320, 360, 390 and 430 CSS-pixel smartphone viewport widths, the recap period tab row is horizontally scrollable when needed. All four existing choices (Hari Ini, Minggu Ini, Bulan Ini, Custom) remain reachable via touch/pointer scrolling or discoverable scroll controls; Custom selection displays both date fields.
- NB-TABS-2: Apply a reusable overflow-safe implementation to all four existing tab rows: RekapTextModal, DashboardPage, AdminPage main navigation, AdminPage trend periods. Audit every MUI Tabs import/usage so no equivalent row remains unintentionally clipped. Respect horizontal vs vertical semantics if a new usage is encountered.
- NB-TABS-3: Preserve tab values, labels, selected state, existing handlers, role semantics, keyboard arrow navigation/focus, modal content scrolling, and authorization. No new page-level horizontal overflow caused by tab rows. Existing date/filter/recap math, clipboard/share and API behavior remain unchanged.
- NB-TABS-4: Desktop (1280 CSS pixels) remains usable and all labels/content are reachable. No assertion weakening, sleeps to hide races, or source-only checks presented as browser layout evidence.

Implementation may use a shared tab wrapper or shared MUI theme policy; explicit local variants must not defeat the smartphone behavior. Prefer existing MUI accessibility and scroll mechanics over bespoke gesture handling. New future equivalent tab rows should inherit or clearly reuse the shared solution.

## Examples and validation
Valid: a narrow recap can scroll to Custom, click it, and interact with Tanggal Mulai/Tanggal Selesai. Valid: keyboard navigation brings an offscreen selected tab into view. Invalid: Custom exists in DOM but is clipped/unreachable; overflow is hidden and scroll controls cannot be used; tabs push the page beyond viewport width.

Regression coverage must exercise the actual shared primitive and consumer semantics; real browser layout/scroll tests at narrow and desktop viewports are required in addition to unit/component tests. An isolated local browser fixture using actual components with mocked API is acceptable for this frontend-only bug; label it as local fixture testing, not deployed/full-stack acceptance. Keep any new reproducible tests runnable without production credentials.

Commands: in frontend use npm ci, npm test -- --run (bound workers to 1 if needed), npm run build. Add focused test command(s) and browser runner instructions in the handoff. Existing playwright project is Chromium-only and has @playwright/test pinned by its lockfile; use its dependencies or an equivalent project-local setup without unrelated dependency upgrades. Save sanitized evidence outside tracked source.

## Exclusions and safety
No backend/schema/API/auth changes; no unrelated mobile redesign, dependencies upgrade, deployment configuration changes, production access, secrets, merge to main, tags or deployment. Scoped local commits on task/integration branches and push of the final feature branch to create the requested PR are authorized by the user PR request. Only default publishes after review; workers do not push. Opening a PR runs CI; inspected release workflow targets main workflow runs/tags, neither is changed by this feature-branch publication.

## Execution preferences
confirmation_mode: ambiguous_requirements_only (user selected “Hanya saat requirement masih ambigu”).
implementation_harness: hermes-direct (user selected “Hermes langsung (tanpa harness eksternal)”). No external coding CLI is to be used.
