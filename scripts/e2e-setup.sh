#!/usr/bin/env bash
# NebengBeli Local HTTPS E2E Setup Script
# Credential-safe setup for local Camofox browser testing and automated verification.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "============================================================"
echo "NebengBeli E2E: Setting up Local HTTPS Test Environment"
echo "============================================================"

# 1. Generate local TLS certificates
"${SCRIPT_DIR}/generate-certs.sh"

# 2. Prepare credential-safe .env file if not present
ENV_FILE="${ROOT_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
    echo "[setup] Creating fresh local .env with randomly generated runtime secrets..."
    
    # Generate ephemeral random secrets (never committed, never printed)
    PG_PASS=$(openssl rand -hex 16)
    JWT_SEC=$(openssl rand -hex 32)
    
    cat <<EOF > "${ENV_FILE}"
# Generated local E2E environment configuration (untracked)
PORT=8080
ENVIRONMENT=development
ENABLE_DEV_ENDPOINTS=true
COOKIE_SECURE=false
POSTGRES_PASSWORD=${PG_PASS}
JWT_SECRET=${JWT_SEC}
JWT_EXPIRY_HOURS=72
FRONTEND_PORT=8088
FRONTEND_HTTPS_PORT=8443
RATE_LIMIT_AUTH=100
RATE_LIMIT_API=300
CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:80,http://localhost:8088,http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:8088,http://172.17.0.1:8088,https://localhost,https://localhost:8443,https://localhost:8088,https://127.0.0.1:8443,https://127.0.0.1:8088,https://172.17.0.1:8443,https://172.17.0.1:8088
EOF
    chmod 600 "${ENV_FILE}"
    echo "[setup] .env created with secure file permissions (0600)."
else
    echo "[setup] Using existing .env configuration."
fi

# 3. Validate compose configuration
echo "[setup] Validating Docker Compose configuration..."
docker compose config --quiet

# 4. Build and start containers
echo "[setup] Building and launching Docker Compose stack..."
docker compose up --build -d

# 5. Wait for readiness
echo "[setup] Waiting for backend and database readiness..."
MAX_RETRIES=30
RETRY_COUNT=0
BACKEND_READY=false

while [[ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]]; do
    if curl -s -f http://localhost:8080/readyz >/dev/null 2>&1; then
        BACKEND_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

if [[ "${BACKEND_READY}" != "true" ]]; then
    echo "[setup] ERROR: Backend service failed to become ready within ${MAX_RETRIES} seconds."
    docker compose logs backend
    exit 1
fi
echo "[setup] Backend and PostgreSQL are ready."

# 6. Wait for Frontend HTTP & HTTPS reverse proxy readiness
echo "[setup] Waiting for frontend HTTP (port 8088) and HTTPS (port 8443) readiness..."
FRONTEND_READY=false
RETRY_COUNT=0

while [[ ${RETRY_COUNT} -lt ${MAX_RETRIES} ]]; do
    HTTP_OK=false
    HTTPS_OK=false

    if curl -s -f http://localhost:8088/healthz >/dev/null 2>&1; then
        HTTP_OK=true
    fi

    if curl -s -k -f https://localhost:8443/healthz >/dev/null 2>&1; then
        HTTPS_OK=true
    fi

    if [[ "${HTTP_OK}" == "true" && "${HTTPS_OK}" == "true" ]]; then
        FRONTEND_READY=true
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

if [[ "${FRONTEND_READY}" != "true" ]]; then
    echo "[setup] ERROR: Frontend HTTP/HTTPS endpoints failed to respond within ${MAX_RETRIES} seconds."
    docker compose logs frontend
    exit 1
fi

echo "============================================================"
echo "[setup] SUCCESS: NebengBeli Local HTTPS E2E Stack is Active!"
echo "  - HTTP Frontend:   http://localhost:8088"
echo "  - HTTPS Frontend:  https://localhost:8443  (Camofox bridge: https://172.17.0.1:8443)"
echo "  - Backend Direct:  http://localhost:8080"
echo "  - PostgreSQL:      localhost:5432"
echo "============================================================"
