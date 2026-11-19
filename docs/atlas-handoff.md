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

Images are built and published to GitHub Container Registry (GHCR) after successful CI on the `main` branch, on `vMAJOR.MINOR.PATCH` version-tag pushes (optional `-prerelease` suffix), and by manual dispatch (which can optionally target an existing version tag):

| Component | Registry & Image Path | Tag Contract |
| :--- | :--- | :--- |
| **Backend** | `ghcr.io/nyuuk/nebengbeli/backend` | Always `sha-${FULL_GIT_SHA}` (40-char SHA); version-tag pushes also publish the release tag and `latest` |
| **Frontend** | `ghcr.io/nyuuk/nebengbeli/frontend` | Always `sha-${FULL_GIT_SHA}` (40-char SHA); version-tag pushes also publish the release tag and `latest` |

> [!IMPORTANT]
> The SHA tag remains the immutable deployment reference. Version-tag pushes and manual dispatches targeting a version tag publish `latest`; successful CI builds and manual dispatches without a release tag publish the SHA tag only.

---

## 3. Continuous Deployment (CD) & Repository Dispatch Contract

### Release Workflow (`.github/workflows/release.yml`)

- **Trigger**: Executes when the `CI` workflow succeeds on branch `main`, on `vMAJOR.MINOR.PATCH` tag pushes (optional `-prerelease` suffix), or via manual `workflow_dispatch`. Version-tag pushes use the production environment; manual dispatch selects development or production.
- **Permissions**: `contents: read`, `packages: write`, and `id-token: write` for GitHub OIDC authentication.
- **Secrets Management**: The workflow loads notification credentials through `.github/actions/vault-secrets`.
- **Concurrency**: Grouped by `release-${{ github.ref }}` with `cancel-in-progress: false` to prevent overlapping releases.

### Future Kubernetes Dispatch Contract (currently disabled)

The following describes the intended integration only. Current workflow does **not** call `repository_dispatch`, validate a deployment token, or update Kubernetes manifests. Re-enable and validate this integration before relying on automatic deployment.

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

If re-enabled, this payload is intended for kube-config to update both image references in a single commit.

### Migration/Server Startup Ordering (required kube-config correction)
The Job invocation above is the exact contract: `exec /app/nebengbeli-cli migrate`; the backend image's default entrypoint remains `/app/nebengbeli-server`. The server currently also runs `database.RunMigrations` before binding HTTP, so the application is safe if the Job and server start concurrently (the migration transaction and `schema_migrations` primary key prevent a successful duplicate version record). However, the CD workflow must not treat the Job as complete merely because the Job manifest was applied: Atlas must make the deployment orchestration wait for the migration Job to reach `Complete` (and fail on `Failed`) before declaring the backend rollout ready. This is a required kube-config change; this application PR does not modify kube-config or disable the server safety fallback.

### Cross-Repository Authorization (future dispatch; currently disabled)
If deployment dispatch is re-enabled, the intended authorization uses a GitHub token obtained dynamically from HashiCorp Vault via GitHub Actions OIDC JWT auth.
- No GitHub repository secrets or static personal access tokens (PATs) are required or configured in the repository.
- Cross-repository access to `Nyuuk/kube-config` is authorized via the Vault-managed GitHub token.
