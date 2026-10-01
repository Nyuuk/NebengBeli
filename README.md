# NebengBeli (Buku Titipan & Shared Ledger)

NebengBeli is a peer-to-peer and small-group shared ledger application built for tracking expenses made on behalf of friends (*titipan*), settlements (*topup*), and append-only adjustments (*koreksi*).

Built with **Go Gin Backend**, **React Vite + Material UI PWA Frontend**, and **PostgreSQL**.

---

## Features (F1 - F11)

- **F1: Authentication & Session Revocation**: Username/password auth with JWT secure HTTP-only cookies and instant token revocation via `token_version` tracking.
- **F2: Wallet Management**: Create, rename, archive, and unarchive shared wallets with calculated real-time balances.
- **F3: Wallet Linking & Ownership Handover**: Request wallet linking by targeting a specific username; approve or reject requests.
- **F4: Immutable Signed BIGINT Ledger**: Core types: `titipan` (+signed debt), `topup` (-signed repayment), and `koreksi` (referential adjustment). Client-side UUID (`client_id`) prevents duplicate postings.
- **F5: Append-Only Corrections & Moves**: Zero `UPDATE` or `DELETE` on the `entries` table (enforced by DB triggers). Move entries between wallets atomically via offset corrections.
- **F6: Statement & Running Balances**: Paginated chronological statements with running balance calculations, date/type filters, and CSV export.
- **F7: Authorization & Security**: Strict creator/owner access boundaries, admin read-only diagnostic access, token bucket rate limiting on auth and API endpoints.
- **F8: Complete Audit Logging**: Comprehensive audit trail recording `actor_id`, `action`, `target_type`, `target_id`, `metadata`, and `created_at`.
- **F9: Admin CLI & Operations**: Standalone CLI tool (`cmd/cli`) to create/promote admin accounts (`create-admin --username`), list users, reset passwords, revoke sessions, inspect wallets, and view stats.
- **F10: Offline-First PWA & IndexedDB Queue**: Installable PWA with Service Worker and IndexedDB offline queue; auto-syncs pending transactions when network reconnects.
- **F11: Production DevOps & Health Checks**: `/healthz` and `/readyz` probes, multi-stage Dockerfiles with unprivileged non-root frontend container runtime (Kubernetes restrictive security safe with read-only root filesystem and dropped capabilities), Docker Compose with unprivileged Nginx static SPA server, and Makefile.

---

## Tech Stack

- **Backend**: Go 1.19+, Gin, PostgreSQL (`github.com/lib/pq`), `golang-jwt/jwt/v5`, `golang.org/x/crypto`, `golang.org/x/time`
- **Frontend**: React 18, TypeScript, Material UI (MUI v5), React Router v7, `idb` (IndexedDB), Vite 6, PWA Service Worker
- **Database**: PostgreSQL 15+ (strictly 5 core tables with immutability triggers)
- **Deployment**: Kubernetes (restricted security standard) & Docker Compose with unprivileged Nginx static SPA server

---

## Quick Start (Docker Compose)

1. Clone the repository and copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Configure `.env` with secure values (e.g. `POSTGRES_PASSWORD`, `JWT_SECRET`, optional `FRONTEND_PORT=80` or `FRONTEND_PORT=8088`).

3. Start the application with Docker Compose:
   ```bash
   make docker-up
   # or: docker compose up --build -d
   ```

4. Open your browser:
   - Frontend App: [http://localhost](http://localhost) (or configured port, e.g. `http://localhost:8088`)
   - Backend Health Check: [http://localhost:8080/healthz](http://localhost:8080/healthz)
   - Create the first administrator explicitly with the CLI command below; no default credentials exist.

---

## Local Development

### 1. Database Setup
Start a local PostgreSQL database:
```bash
docker run --name nebengbeli-db -e POSTGRES_DB=nebengbeli -e POSTGRES_PASSWORD=your_secure_password -p 5432:5432 -d postgres:15-alpine
```

### 2. Backend
```bash
cd backend
go mod tidy
go test -v ./tests/...
go run ./cmd/server/main.go
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend development server runs on `http://localhost:5173` with proxy forwarding `/api` to `http://localhost:8080`.

---

## Secure Context & PWA Local Setup

NebengBeli is built as an offline-capable Progressive Web Application (PWA). Under W3C Secure Context specifications:

1. **Localhost Development as Potentially Trustworthy Origin**:
   - Modern browsers treat loopback origins (`http://localhost`, `http://127.0.0.1`, `http://[::1]`) as **Potentially Trustworthy Origins** (Secure Contexts) natively over plain HTTP.
   - The Service Worker (`/service-worker.js`), Web App Manifest (`/manifest.json`), IndexedDB offline transaction queue, and Web Crypto APIs function natively when accessed via:
     - `http://localhost:5173` (Vite frontend dev server)
     - `http://localhost` or `http://localhost:8088` (Docker Compose HTTP accessed from the host)
   - In accordance with web standards, Service Workers cannot be registered from `file://` URLs or insecure non-loopback HTTP origins.

2. **Containerized Browser Topology (Camofox Bridge Rewriting) & Honest Architectural Constraints**:
   - When a browser agent runs inside an isolated Docker container, navigating to `localhost` causes the container engine to rewrite the host address to the Docker bridge gateway (e.g. `http://172.17.0.1:8088`).
   - Because `172.17.0.1` is a plain HTTP non-loopback IP address, native browsers strictly evaluate `window.isSecureContext === false` and disable Service Worker APIs.
   - **Prohibited Workarounds**: Insecure browser flags (e.g., `--ignore-certificate-errors`, `--unsafely-treat-insecure-origin-as-secure`) and untrusted self-signed TLS certificates are strictly prohibited in production and compliance testing because they violate standards and produce browser TLS rejection errors.
   - **Standards-Compliant Local Solutions**:
     - **Option A (Preserve Loopback with Host Networking)**: Run the browser container with `--network host` so that `localhost:8088` directly resolves to `127.0.0.1`, preserving the loopback Potentially Trustworthy Origin natively.
     - **Option B (Trusted Local TLS with mkcert)**:
       1. Install a local root Certificate Authority into the host and browser trust stores:
          ```bash
          mkcert -install
          ```
       2. Generate trusted certificates covering all required SANs (including loopback and bridge IPs):
          ```bash
          mkdir -p certs
          mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 172.17.0.1 ::1
          ```
       3. Mount `./certs:/etc/nginx/certs:ro` into the frontend container and configure Nginx TLS listener on port 443/8443.
       4. Access `https://localhost:8443` or `https://172.17.0.1:8443`. The native browser will establish trusted TLS without security warnings or disabled APIs.
     - **Honest Scaffolding**: If the test runner environment does not allow installing a custom root CA into the container's NSS trust store or enabling host networking, plain HTTP across bridge `172.17.0.1` cannot be made a secure context under W3C specifications without external trusted infrastructure.

3. **Production Deployments**:
   - In production environments, terminate HTTPS with valid TLS certificates issued by an accredited public Certificate Authority (e.g., Let's Encrypt / automated ACME proxy) and set `COOKIE_SECURE=true`.

---

## Developer Fixture Endpoints & Automated Testing

For integration test automation:
- Dev endpoints (`/api/dev/*`) **fail closed by default** across all environments.
- They can only be enabled for local development by explicitly exporting `ENABLE_DEV_ENDPOINTS=true` in a `development` or `local` environment:
  ```bash
  export ENVIRONMENT=development
  export ENABLE_DEV_ENDPOINTS=true
  go run ./backend/cmd/server/main.go
  ```
- In Docker Compose, enable dev endpoints for testing by setting environment variables:
  ```bash
  ENVIRONMENT=development ENABLE_DEV_ENDPOINTS=true docker compose up -d
  ```
- Dev endpoints are strictly locked out (404 Not Found) in `production` and `staging` environments regardless of environment variable values.
- **Fail-Closed Session Policy**:
  - `POST /api/dev/session` is **strictly disabled fail-closed** and always returns `403 Forbidden`. No password-free endpoint may issue authenticated sessions to arbitrary callers or predefined personas under any circumstances. No default passwords, embedded secrets, or session bypass tokens exist.
  - **Native Browser Fixture Limitation**: Automated end-to-end browser testing cannot use passwordless session injection into browser contexts. Browser workflows must authenticate normally through standard login/registration flows (`POST /api/auth/login`, `POST /api/auth/register`).
  - `POST /api/dev/fixtures/seed`: Seed predictable test scenario data (`"standard"`, `"empty"`, `"linked"`). Fixture users (`test_creator`, `test_owner`, `test_admin`) are created with cryptographically random hashed passwords and no session tokens or plaintext credentials are ever returned.
  - `POST /api/dev/fixtures/reset`: Safely wipe test data from database tables in local development.

---

## Admin CLI Usage

The repository includes a dedicated CLI binary in `backend/cmd/cli`:

```bash
# Create or promote admin user
go run ./backend/cmd/cli/main.go create-admin --username <username> --password <password>

# View summary statistics
go run ./backend/cmd/cli/main.go stats

# List all users and token versions
go run ./backend/cmd/cli/main.go users

# Reset user password and revoke existing sessions
go run ./backend/cmd/cli/main.go reset-password --username <username> --password <new_password>

# List all wallets
go run ./backend/cmd/cli/main.go wallets

# View recent audit logs
go run ./backend/cmd/cli/main.go audit-logs --limit 20

# Inspect specific wallet statement
go run ./backend/cmd/cli/main.go inspect-wallet --id <wallet_uuid>
```

---

## API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | Liveness health check |
| `GET` | `/readyz` | Readiness database ping |
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login and receive secure cookie |
| `POST` | `/api/auth/logout` | Revoke session & clear cookie |
| `GET` | `/api/auth/me` | Current authenticated user |
| `POST` | `/api/auth/reset-password` | Reset self password |
| `POST` | `/api/wallets` | Create wallet |
| `GET` | `/api/wallets` | List user wallets (query `?archived=true/false`) |
| `GET` | `/api/wallets/:id` | Get wallet details & balance |
| `PATCH` | `/api/wallets/:id/name` | Update wallet name |
| `POST` | `/api/wallets/:id/archive` | Archive wallet |
| `POST` | `/api/wallets/:id/unarchive` | Unarchive wallet |
| `POST` | `/api/wallets/:id/entries` | Add ledger entry (`titipan`, `topup`, `koreksi`) |
| `GET` | `/api/wallets/:id/statement` | Paginated wallet statement with running balance |
| `GET` | `/api/wallets/:id/statement/export` | Export wallet statement as CSV |
| `POST` | `/api/entries/move` | Move entry between wallets (append-only) |
| `POST` | `/api/wallets/:id/links` | Create link request for wallet targeting user |
| `GET` | `/api/links` | List incoming & outgoing link requests |
| `GET` | `/api/links/:id` | Get specific link request |
| `POST` | `/api/links/:id/approve` | Approve wallet link request |
| `POST` | `/api/links/:id/reject` | Reject wallet link request |
| `GET` | `/api/admin/stats` | Admin platform statistics |
| `GET` | `/api/admin/users` | Admin list users |
| `POST` | `/api/admin/users/reset-password` | Admin reset user password |
| `GET` | `/api/admin/audit-logs` | Admin view audit logs |

---

## License

MIT License
