# Atlas Handoff & Deployment Contract

This document specifies the migration execution model, container image contracts, and deployment dispatch workflows for **NebengBeli**.

---

## 1. Database Schema Migrations

### Migration Engine & Idempotency
- Database migrations are managed via embedded SQL migration files (`backend/internal/database/migrations/`).
- Migrations are tracked in the PostgreSQL `schema_migrations` table (`version INT PRIMARY KEY, applied_at TIMESTAMPTZ`).
- Migration execution is **strictly idempotent** and **non-serving**:
  - If a migration version has already been recorded, execution logs `Database schema is up to date` and exits immediately with code `0`.
  - If pending migrations exist, DDL is executed inside a single transaction and recorded before committing.
  - The migration CLI does not initialize HTTP handlers, routers, or bind ports.

### CLI Migration Invocation
The standalone CLI binary provides the `migrate` subcommand:

```bash
# Direct binary execution
/app/nebengbeli-cli migrate

# Local development via go run
cd backend && go run ./cmd/cli migrate
```

Configuration is loaded from environment variables (primarily `DATABASE_URL`).

### Kubernetes Job Invocation & Docker Entrypoint Override
The production backend container image (`Dockerfile.backend`) defines default entrypoint `ENTRYPOINT ["/app/nebengbeli-server"]`.

In Kubernetes and Docker environments, the entrypoint must be overridden to execute the migration CLI:

#### Kubernetes Job (`apps/nebengbeli/migrate-job.yaml`):
```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: nebengbeli-migrate
  labels:
    app.kubernetes.io/name: nebengbeli-migrate
    app.kubernetes.io/part-of: nebengbeli
spec:
  backoffLimit: 2
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: nebengbeli-migrate
          image: ghcr.io/nyuuk/nebengbeli/backend:sha-<FULL_GIT_SHA>
          command: ["/bin/sh", "-c"]
          args: ["set -a && . /rendered/app.env && set +a && exec /app/nebengbeli-cli migrate"]
          # Alternatively for direct env injection:
          # command: ["/app/nebengbeli-cli", "migrate"]
```

#### Docker Run Override:
```bash
docker run --rm \
  -e DATABASE_URL="postgres://user:pass@host:5432/dbname?sslmode=disable" \
  --entrypoint /app/nebengbeli-cli \
  ghcr.io/nyuuk/nebengbeli/backend:sha-<FULL_GIT_SHA> \
  migrate
```

---

## 2. Container Image Contract

Images are built and published to GitHub Container Registry (GHCR) upon successful CI on the `main` branch:

| Component | Registry & Image Path | Tag Contract |
| :--- | :--- | :--- |
| **Backend** | `ghcr.io/nyuuk/nebengbeli/backend` | `sha-${FULL_GIT_SHA}` (40-char SHA) |
| **Frontend** | `ghcr.io/nyuuk/nebengbeli/frontend` | `sha-${FULL_GIT_SHA}` (40-char SHA) |

> [!IMPORTANT]
> **No `latest` tags**: All production images are strictly pinned to immutable `sha-${FULL_GIT_SHA}` tags to ensure deterministic deployments and rollback stability.

---

## 3. Continuous Deployment (CD) & Repository Dispatch Contract

### Release Workflow (`.github/workflows/release.yml`)
- **Trigger**: Automatically executes on `workflow_run` completion when the `CI` workflow succeeds on branch `main` (or via manual `workflow_dispatch`).
- **Permissions**: Minimum permissions (`contents: read`, `packages: write`). No `kubectl` or `Vault` credentials required in the release workflow.
- **Concurrency**: Grouped by `release-${{ github.ref }}` with `cancel-in-progress: false` to prevent overlapping releases.

### Dispatch Event Payload Specification
Upon successful build and push of backend and frontend images, the workflow emits a single `repository_dispatch` event to `Nyuuk/kube-config`:

- **Event Type**: `deploy`
- **Target Repository**: `Nyuuk/kube-config`
- **Target Folder**: `apps/nebengbeli`
- **Client Payload**:
  ```json
  {
    "target_folder": "apps/nebengbeli",
    "images": "{\"backend.yaml\":{\"backend\":\"sha-<FULL_GIT_SHA>\"},\"frontend.yaml\":{\"frontend\":\"sha-<FULL_GIT_SHA>\"}}"
  }
  ```

This nested JSON structure allows `kube-config/.github/workflows/cd.yaml` to update both `backend.yaml` and `frontend.yaml` container images in a single atomic Git commit, preventing git race conditions.

### Migration/Server Startup Ordering (required kube-config correction)
The Job invocation above is the exact contract: `exec /app/nebengbeli-cli migrate`; the backend image's default entrypoint remains `/app/nebengbeli-server`. The server currently also runs `database.RunMigrations` before binding HTTP, so the application is safe if the Job and server start concurrently (the migration transaction and `schema_migrations` primary key prevent a successful duplicate version record). However, the CD workflow must not treat the Job as complete merely because the Job manifest was applied: Atlas must make the deployment orchestration wait for the migration Job to reach `Complete` (and fail on `Failed`) before declaring the backend rollout ready. This is a required kube-config change; this application PR does not modify kube-config or disable the server safety fallback.

### Cross-Repository Authorization Prerequisite
The release workflow calls the GitHub REST API using `GITHUB_TOKEN`.
- If `Nyuuk/kube-config` is a separate private repository and default `GITHUB_TOKEN` cross-repository access is restricted by GitHub organization policies, a repository secret (e.g. Personal Access Token or GitHub App token with `repo` / `contents: write` permissions on `Nyuuk/kube-config`) can be configured if needed.
