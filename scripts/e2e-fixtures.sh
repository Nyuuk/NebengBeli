#!/usr/bin/env bash
# NebengBeli Local E2E Fixture Manager
# Handles admin creation, fixture seeding, and table resets safely.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

ACTION="${1:-help}"

case "${ACTION}" in
    create-admin)
        USERNAME="${2:-e2e_admin}"
        PASSWORD="${3:-}"

        if [[ -z "${PASSWORD}" ]]; then
            # Generate a strong ephemeral password if not provided
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
        echo "[fixtures] Seeding test fixtures (scenario: ${SCENARIO})..."
        RESPONSE=$(curl -s -k -X POST https://localhost:8443/api/dev/fixtures/seed \
            -H "Content-Type: application/json" \
            -d "{\"scenario\":\"${SCENARIO}\"}")
        
        echo "[fixtures] Seed response: ${RESPONSE}"
        ;;

    reset)
        echo "[fixtures] Resetting test database tables..."
        RESPONSE=$(curl -s -k -X POST https://localhost:8443/api/dev/fixtures/reset \
            -H "Content-Type: application/json" \
            -d "{}")
        
        echo "[fixtures] Reset response: ${RESPONSE}"
        ;;

    status)
        echo "[fixtures] Checking developer endpoints status..."
        STATUS_RESP=$(curl -s -k https://localhost:8443/api/dev/status || echo '{"enabled":false}')
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
        echo "Usage: $0 <command> [arguments]"
        echo ""
        echo "Commands:"
        echo "  create-admin [username] [password]  Create or update an admin user"
        echo "  seed [standard|empty|linked]        Seed predictable fixture accounts & wallets"
        echo "  reset                               Wipe fixture data safely in dev mode"
        echo "  status                              Check dev endpoint and platform statistics"
        echo "  list-users                          List users and token versions via CLI"
        exit 1
        ;;
esac
