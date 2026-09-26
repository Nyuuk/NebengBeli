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
- **F11: Production DevOps & Health Checks**: `/healthz` and `/readyz` probes, multi-stage Dockerfiles, Docker Compose with Nginx reverse proxy, and Makefile.

---

## Tech Stack

- **Backend**: Go 1.19+, Gin, PostgreSQL (`github.com/lib/pq`), `golang-jwt/jwt/v5`, `golang.org/x/crypto`, `golang.org/x/time`
- **Frontend**: React 18, TypeScript, Material UI (MUI v5), React Router v6, `idb` (IndexedDB), Vite 5, PWA Service Worker
- **Database**: PostgreSQL 15+ (strictly 5 core tables with immutability triggers)
- **Deployment**: Docker Compose & Nginx reverse proxy

---

## Quick Start (Docker Compose)

1. Clone the repository and copy the environment template:
   ```bash
   cp .env.example .env
   ```

2. Start the application with Docker Compose:
   ```bash
   make docker-up
   # or: docker compose up --build -d
   ```

3. Open your browser:
   - Frontend App: [http://localhost](http://localhost) (or port 80)
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

1. **Localhost Development as Secure Context**:
   - Modern browsers treat `http://localhost` and `http://127.0.0.1` as **Potentially Trustworthy Origins** (Secure Contexts).
   - The Service Worker (`/service-worker.js`), Web App Manifest (`/manifest.json`), IndexedDB offline transaction queue, and Web Crypto APIs function natively when accessed via `http://localhost:5173` (Vite dev server) or `http://localhost` (Docker Nginx reverse proxy).
   - In accordance with web standards, Service Workers cannot be registered from `file://` URLs.

2. **Mobile / Remote Device Testing**:
   - To test PWA installation on physical mobile devices over USB without installing self-signed TLS certificates, use Android reverse port forwarding:
     ```bash
     adb reverse tcp:5173 tcp:5173
     # Access http://localhost:5173 on the mobile device browser
     ```
   - In production environments, HTTPS with valid TLS certificates must be terminated at the reverse proxy or ingress.

---

## Developer Fixture Endpoints & Automated Testing

For end-to-end and integration test automation:
- Dev endpoints (`/api/dev/*`) **fail closed by default** across all environments.
- They can only be enabled for local development by explicitly exporting `ENABLE_DEV_ENDPOINTS=true` in a `development` or `local` environment:
  ```bash
  export ENVIRONMENT=development
  export ENABLE_DEV_ENDPOINTS=true
  go run ./backend/cmd/server/main.go
  ```
- Dev endpoints are strictly locked out in `production` and `staging` environments regardless of environment variable values.

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
