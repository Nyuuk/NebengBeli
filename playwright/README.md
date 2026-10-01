# NebengBeli Standalone Playwright E2E Test Suite

Standalone, Chromium-only end-to-end (E2E), UI, and API test project for NebengBeli. Encodes a verified 29-test regression baseline covering core features across F1–F11, security, ledger invariants, and offline sync. Known uncovered PRD edge cases (such as edge-case creator subtotals in F7, granular chart filtering in F8, conflict retry in F11, and atomic rollback under failure conditions) are documented in [`PRD-TRACEABILITY.md`](PRD-TRACEABILITY.md).

---

## 🚀 Prerequisites

1. **Node.js**: v18+ (tested with v20/v22).
2. **Docker & Docker Compose**: For launching the isolated local test stack.
3. **Chromium browser**: Managed via Playwright (`npx playwright install chromium`).

---

## 📦 Quick Start & Installation

From the repository root or inside the `playwright/` directory:

```bash
# 1. Install dependencies
cd playwright && npm install

# 2. Install Chromium browser if not already cached
npx playwright install chromium
```

---

## 🧪 Running Tests

### 1. Run Complete Test Suite
```bash
# From repository root
make test-e2e

# Or inside playwright/
npm test
```

### 2. Run in Headed / Interactive Mode
```bash
npm run test:headed
```

### 3. Run in Playwright UI Mode
```bash
npm run test:ui
```

### 4. Run in Debug Mode (Step-by-Step Inspector)
```bash
npm run test:debug
```

### 5. Run Targeted Test Subsets
```bash
# Only API layer tests
npm run test:api

# Only UI/Browser tests
npm run test:ui-layer

# Run a specific PRD feature spec
npx playwright test tests/f1-shopping-session.spec.ts
npx playwright test tests/f3-corrections-and-moves.spec.ts
```

---

## 📊 Viewing Test Reports & Failure Artifacts

```bash
# View HTML Report in browser
npm run report
# Or from root
make e2e-report
```

- **HTML Report**: `playwright/playwright-report/index.html`
- **JSON Results**: `playwright/test-results/results.json`
- **Failure Artifacts**: Screenshots, videos, and Playwright execution traces (`trace.zip`) are automatically saved to `playwright/test-results/` on any test failure.

---

## 🏗️ Test Environment Lifecycle

The Playwright suite runs against the local NebengBeli stack.

```bash
# Setup and start local test stack
./scripts/e2e-setup.sh

# Seed deterministic fixtures
./scripts/e2e-fixtures.sh seed standard

# Stop stack and cleanup ephemeral containers
./scripts/e2e-cleanup.sh
```

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:8088` | Base URL for frontend web app |
| `PLAYWRIGHT_API_URL` | `http://localhost:8080` | Direct backend API URL |
| `PLAYWRIGHT_WORKERS` | `1` | Concurrency worker count |
| `CI` | `false` | When true, enables 2 retries on failures |

---

## 📁 Project Directory Structure

```
playwright/
├── fixtures/
│   └── test-fixtures.ts          # Extended test runner with isolated auth fixtures
├── helpers/
│   ├── api-client.ts             # Authenticated backend API request wrapper
│   ├── auth.ts                   # Normal login, register, logout, password change helpers
│   ├── clipboard.ts              # Browser clipboard read/permission helpers
│   ├── date-tz.ts                # Asia/Jakarta timezone & date presets
│   ├── dev-fixtures.ts           # Dev fixture endpoints & CLI admin helpers
│   ├── ledger-assert.ts          # Ledger invariant & balance assertions
│   ├── offline-idb.ts            # IndexedDB queue & offline network simulator
│   └── test-data.ts              # Deterministic unique test data generators
├── tests/
│   ├── f1-shopping-session.spec.ts
│   ├── f2-single-entry.spec.ts
│   ├── f3-corrections-and-moves.spec.ts
│   ├── f4-text-recap.spec.ts
│   ├── f5-wallet-management.spec.ts
│   ├── f6-wallet-linking.spec.ts
│   ├── f7-dashboard-and-home.spec.ts
│   ├── f8-creator-insights.spec.ts
│   ├── f9-admin-views.spec.ts
│   ├── f10-auth-security.spec.ts
│   ├── f11-offline-pwa-sync.spec.ts
│   └── nonfunctional-ledger-security.spec.ts
├── PRD-TRACEABILITY.md            # Traceability matrix mapping PRD F1-F11 to tests
├── package.json
├── playwright.config.ts          # Chromium-only configuration
├── README.md
└── tsconfig.json
```

---

## 🔍 Troubleshooting

- **Backend not responding**: Ensure `docker compose ps` shows `nebengbeli-backend` as `healthy`. Run `./scripts/e2e-setup.sh` to restart.
- **Port conflicts**: If ports `8088` or `8080` are occupied, adjust `FRONTEND_PORT` and `PORT` in `.env` and set `PLAYWRIGHT_BASE_URL`.
- **Database state reset**: Run `curl -X POST http://localhost:8080/api/dev/fixtures/reset -H "Content-Type: application/json" -d "{}"` or `./scripts/e2e-fixtures.sh reset`.
