# Local-Only Deterministic Disposable E2E Fixtures

NebengBeli provides a dedicated, deterministic, and disposable fixture management system designed for end-to-end (E2E) automated browser verification (including Camofox / Playwright / Puppeteer suites) without weakening production authentication or compromising security boundaries.

---

## 1. Security Architecture & Fail-Closed Guards

The fixture endpoints (`/api/dev/*`) are protected by multiple layers of fail-closed guards:

1. **Environment Guard**: Developer fixture endpoints are only mounted when `ENABLE_DEV_ENDPOINTS=true` AND `ENVIRONMENT` is explicitly one of `development`, `local`, `dev`, or `test`.
2. **Production Immunity**: In production (`ENVIRONMENT=production`), the backend strictly rejects dev endpoint registration at server startup, and the handler returns `HTTP 403 Forbidden` if called.
3. **No Passwordless Session Issuance**: The endpoint `POST /api/dev/session` is intentionally and permanently disabled with a `HTTP 403 Forbidden` response. Authenticated sessions can **only** be obtained by executing genuine `POST /api/auth/login` authentication with valid credentials.
4. **Credential Safety**: No private keys or secret tokens are output to logs or unauthenticated channels.

---

## 2. Supported Fixture Scenarios

The `POST /api/dev/fixtures/seed` endpoint accepts a JSON payload with `scenario` and optional `password`:

| Scenario | Description | Accounts Created | Wallets / Entries |
| :--- | :--- | :--- | :--- |
| `empty` | Pristine database with base accounts | `test_creator`, `test_owner`, `test_admin` | No wallets or entries |
| `standard` *(default)* | Standard active workspace | `test_creator`, `test_owner`, `test_admin` | 1 wallet (*Buku Makan Siang*) with 2 entries (+50k titipan, -50k topup) |
| `linked` | Linked wallet with active owner | `test_creator`, `test_owner`, `test_admin` | 1 wallet linked to `test_owner` |
| `disposable` | Isolated dynamic test environment | Unique `disp_<hex>` user & base accounts | Dedicated disposable wallet for isolated parallel test execution |

Default deterministic test password: `TestPassword123!` (or customizable per request).

---

## 3. Fixture Management Script (`scripts/e2e-fixtures.sh`)

Use `scripts/e2e-fixtures.sh` to manage fixtures from the host shell:

```bash
# Check developer endpoint readiness and platform statistics
./scripts/e2e-fixtures.sh status

# Seed standard deterministic fixtures
./scripts/e2e-fixtures.sh seed standard

# Seed a clean disposable environment with custom password
./scripts/e2e-fixtures.sh seed disposable "CustomPass123!"

# Wipe all fixture tables safely in development mode
./scripts/e2e-fixtures.sh reset

# Create or promote an admin account via CLI
./scripts/e2e-fixtures.sh create-admin e2e_admin "AdminSecret123!"

# List all registered users and token versions
./scripts/e2e-fixtures.sh list-users
```

---

## 4. Reset & Disposable Lifecycle in Test Suites

For test isolation between test runs, call `reset` followed by `seed`:

```bash
# 1. Reset all tables
curl -k -X POST https://localhost:8443/api/dev/fixtures/reset -H "Content-Type: application/json" -d "{}"

# 2. Seed scenario
curl -k -X POST https://localhost:8443/api/dev/fixtures/seed -H "Content-Type: application/json" -d '{"scenario":"standard"}'

# 3. Authenticate via real login endpoint
curl -k -X POST https://localhost:8443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_creator","password":"TestPassword123!"}'
```
