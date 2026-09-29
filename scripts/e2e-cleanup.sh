#!/usr/bin/env bash
# NebengBeli Local E2E Cleanup Script
# Stops containers, cleans ephemeral test data, and restores clean state.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

MODE="${1:-default}"

# Compose expands required variables even for `down`. If setup already removed
# the generated .env, use process-local placeholders solely to address teardown;
# never write or print them.
compose_down() {
    if [[ -f "${ROOT_DIR}/.env" ]]; then
        docker compose down "$@"
    else
        POSTGRES_PASSWORD=cleanup-only JWT_SECRET=cleanup-only docker compose down "$@"
    fi
}

echo "============================================================"
echo "NebengBeli E2E: Cleaning up Local Test Environment"
echo "============================================================"

case "${MODE}" in
    --volumes|-v)
        echo "[cleanup] Stopping containers and removing volumes..."
        compose_down -v --remove-orphans
        ;;
    --all)
        echo "[cleanup] Full teardown: stopping containers, removing volumes, and cleaning generated certs..."
        compose_down -v --remove-orphans
        rm -rf "${ROOT_DIR}/certs"
        rm -f "${ROOT_DIR}/.env"
        ;;
    default|*)
        echo "[cleanup] Stopping containers..."
        compose_down --remove-orphans
        ;;
esac

echo "[cleanup] Cleanup complete."
