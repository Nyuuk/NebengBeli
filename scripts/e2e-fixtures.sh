#!/usr/bin/env bash
# NebengBeli Local E2E Fixture Manager
# Handles admin creation, fixture seeding, and table resets safely.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# Endpoint resolution:
# Explicit safe configurable local HTTP API default (http://localhost:8080).
# Optional HTTPS is only used when explicitly requested (e.g. API_URL=https://... or USE_HTTPS=true).
API_URL="${API_URL:-${DEV_API_URL:-${NEBENGBELI_API_URL:-}}}"
if [[ -z "${API_URL}" ]]; then
    if [[ "${USE_HTTPS:-false}" == "true" || "${E2E_USE_HTTPS:-false}" == "true" ]]; then
        API_URL="https://localhost:8443"
    else
        API_URL="http://localhost:8080"
    fi
fi

ACTION="${1:-help}"

case "${ACTION}" in
    create-admin)
        USERNAME="${2:-e2e_admin}"
        PASSWORD="${3:-}"

        if [[ -z "${PASSWORD}" ]]; then
            # Generate a strong ephemeral password if not provided (never print secret)
            PASSWORD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16)
            echo "[fixtures] Creating admin '${USERNAME}' with generated credentials..."
        else
            echo "[fixtures] Creating admin '${USERNAME}' with provided credentials..."
        fi

        docker compose exec -T backend /app/nebengbeli-cli create-admin \
            --username "${USERNAME}" \
            --password "${PASSWORD}"
        echo "[fixtures] Admin user '${USERNAME}' ready."
        ;;

    seed)
        SCENARIO="${2:-standard}"
        PASSWORD="${3:-TestPassword123!}"
        echo "[fixtures] Seeding test fixtures (scenario: ${SCENARIO}) via ${API_URL}..."
        RESPONSE=$(curl -sS -X POST "${API_URL}/api/dev/fixtures/seed" \
            -H "Content-Type: application/json" \
            -d "{\"scenario\":\"${SCENARIO}\",\"password\":\"${PASSWORD}\"}")
        
        echo "[fixtures] Seed response: ${RESPONSE}"
        ;;

    reset)
        echo "[fixtures] Resetting test database tables via ${API_URL}..."
        RESPONSE=$(curl -s -k -X POST "${API_URL}/api/dev/fixtures/reset" \
            -H "Content-Type: application/json" \
            -d "{}")
        
        echo "[fixtures] Reset response: ${RESPONSE}"
        ;;

    status)
        echo "[fixtures] Checking developer endpoints status via ${API_URL}..."
        STATUS_RESP=$(curl -s -k "${API_URL}/api/dev/status" || echo '{"enabled":false}')
        echo "[fixtures] Status: ${STATUS_RESP}"
        echo ""
        echo "[fixtures] Database Stats:"
        docker compose exec -T backend /app/nebengbeli-cli stats || true
        ;;

    list-users)
        echo "[fixtures] Registered Users in Database:"
        docker compose exec -T backend /app/nebengbeli-cli users
        ;;

    *)
        echo "Usage: [API_URL=http://localhost:8080] [USE_HTTPS=true] $0 <command> [arguments]"
        echo ""
        echo "Commands:"
        echo "  create-admin [username] [password]                 Create or update an admin user"
        echo "  seed [standard|empty|linked|disposable] [password] Seed deterministic fixture accounts & wallets"
        echo "  reset                                              Wipe fixture data safely in dev mode"
        echo "  status                                             Check dev endpoint and platform statistics"
        echo "  list-users                                         List users and token versions via CLI"
        echo ""
        echo "Environment Variables:"
        echo "  API_URL      Backend endpoint (default: http://localhost:8080)"
        echo "  USE_HTTPS    Set to 'true' to use https://localhost:8443 if API_URL is unset"
        exit 1
        ;;
esac
