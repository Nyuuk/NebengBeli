NebengBeli local runtime readiness
Date: 2026-09-26

Scope
- Local-only readiness and fixture preparation for Browser E2E.
- No browser, Playwright, Selenium, Chrome CDP, or UI automation used.
- Runtime secrets were generated randomly in untracked .env and are not recorded here.

Repository state
- Branch: main
- Initial state: application branch clean; docs/ was already untracked orchestration/test-plan content.
- Runtime-only files: .env (mode 0600, untracked), docker-compose.override.yml (untracked local port override), test-results/ (untracked evidence).

Compose and service state
- `docker compose config --quiet`: PASS (exit 0; Compose emitted only obsolete version-key warning).
- `docker compose up --build -d`: images built and postgres/backend started, but default frontend port 80 was occupied by an unrelated system nginx.
- Resolution: local-only docker-compose.override.yml maps frontend to host port 8088; no application behavior changed. Stack then started successfully with `docker compose up -d`.
- `docker compose ps`: postgres healthy, backend healthy, frontend Up.
- PostgreSQL: localhost:5432, container healthy.
- Backend: http://localhost:8080, container healthy.
- Frontend: http://localhost:8088, HTTP 200.
- Port 80 is occupied by pre-existing host nginx; do not use the default frontend URL on this host.

Readiness probes
- GET http://localhost:8080/healthz -> HTTP 200, {"status":"alive"}.
- GET http://localhost:8080/readyz -> HTTP 200, {"db_ping":"ok","status":"ready"}.
- GET http://localhost:8088/ -> HTTP 200 and application HTML.
- GET http://localhost:8080/api/wallets without credentials -> HTTP 401, {"error":"authentication required"}.
- Backend startup completed migrations before reporting healthy (verified by readyz db_ping=ok and container health).

Fixtures
- CLI command used inside backend container: `/app/nebengbeli-cli create-admin --username e2e_admin --password <explicit local password>`; result: admin created.
- Exact non-secret identities:
  - e2e_admin (admin; CLI-created)
  - e2e_creator (user; API registration fixture)
  - e2e_owner (user; API registration fixture)
- CLI users listing confirmed total 3 and expected roles. Passwords intentionally omitted.
- Creator registration -> HTTP 201.
- Owner registration -> HTTP 201.
- Creator login with wrong password -> HTTP 401.
- Creator login with valid password -> HTTP 200.

Evidence
- test-results/forge-compose.log contains compose status and non-secret health/frontend command output.
- This file contains no passwords, JWTs, database URLs, or credential values.

Browser handoff
- Browser may start E2E against http://localhost:8088 (frontend) with backend API at http://localhost:8080.
- Browser must register/UI-create fresh creator and owner if it needs to validate UI registration; API fixtures above already exist for API prerequisite coverage.
- Stack intentionally left running.

Limitations/blockers
- Default port 80 cannot be used because pre-existing host nginx owns it. Local override is required and is preserved for Browser.
- Immutable ledger/idempotency writes were not exercised here because they require the browser-created wallet/authenticated journey; unauthenticated API guard was verified. Browser owns full UI E2E.
