#!/usr/bin/env bash
# NebengBeli End-to-End Orchestrator Runner
# Executes full lifecycle: setup -> seed fixtures -> smoke verification -> readiness summary.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "============================================================"
echo "NebengBeli Local HTTPS Camofox E2E Orchestrator"
echo "============================================================"

# Step 1: Setup stack
"${SCRIPT_DIR}/e2e-setup.sh"

# Step 2: Ensure Admin and Seed Standard Fixtures
echo ""
echo "[runner] Initializing test fixtures..."
"${SCRIPT_DIR}/e2e-fixtures.sh" create-admin e2e_admin
"${SCRIPT_DIR}/e2e-fixtures.sh" seed standard

# Step 3: Run Smoke & Verification Suite
echo ""
echo "[runner] Executing smoke verification..."
"${SCRIPT_DIR}/e2e-smoke.sh"

echo ""
echo "============================================================"
echo "[runner] E2E Environment is Ready for Camofox Browser Testing!"
echo "  - Local URL:        https://localhost:8443"
echo "  - Docker Bridge:    https://172.17.0.1:8443"
echo "  - Service Worker:   Enabled (Secure Context verified)"
echo "  - Admin Username:   e2e_admin"
echo "============================================================"
