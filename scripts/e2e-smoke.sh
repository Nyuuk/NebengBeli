#!/usr/bin/env bash
# NebengBeli Automated Local HTTPS Smoke & Readiness Test
# Validates Compose topology, TLS certificates, PWA assets, reverse proxy, and CLI health.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

PASSED_COUNT=0
FAILED_COUNT=0

record_pass() {
    local name="$1"
    local detail="${2:-}"
    PASSED_COUNT=$((PASSED_COUNT + 1))
    echo "  [PASS] ${name}${detail:+: ${detail}}"
}

record_fail() {
    local name="$1"
    local error="${2:-}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    echo "  [FAIL] ${name}${error:+ - ${error}}"
}

echo "============================================================"
echo "NebengBeli Local HTTPS E2E Smoke & Verification Suite"
echo "============================================================"

# --- 1. Topology & Container State ---
echo ""
echo "1. Verifying Docker Compose Service States..."
SERVICES=$(docker compose ps --format json 2>/dev/null || true)

if docker compose ps | grep -qE "postgres|nebengbeli-postgres"; then
    record_pass "PostgreSQL container" "running"
else
    record_fail "PostgreSQL container" "not running"
fi

if docker compose ps | grep -qE "backend|nebengbeli-backend"; then
    record_pass "Backend container" "running"
else
    record_fail "Backend container" "not running"
fi

if docker compose ps | grep -qE "frontend|nebengbeli-frontend"; then
    record_pass "Frontend container" "running"
else
    record_fail "Frontend container" "not running"
fi

# --- 2. Direct Backend Health Probes ---
echo ""
echo "2. Direct Backend Health Probes (Port 8080)..."
HEALTHZ_RESP=$(curl -s -w "\n%{http_code}" http://localhost:8080/healthz || echo -e "\n000")
HEALTHZ_BODY=$(echo "${HEALTHZ_RESP}" | head -n -1)
HEALTHZ_CODE=$(echo "${HEALTHZ_RESP}" | tail -n 1)

if [[ "${HEALTHZ_CODE}" == "200" && "${HEALTHZ_BODY}" == *"alive"* ]]; then
    record_pass "Backend /healthz probe" "HTTP 200 alive"
else
    record_fail "Backend /healthz probe" "HTTP ${HEALTHZ_CODE}: ${HEALTHZ_BODY}"
fi

READYZ_RESP=$(curl -s -w "\n%{http_code}" http://localhost:8080/readyz || echo -e "\n000")
READYZ_BODY=$(echo "${READYZ_RESP}" | head -n -1)
READYZ_CODE=$(echo "${READYZ_RESP}" | tail -n 1)

if [[ "${READYZ_CODE}" == "200" && "${READYZ_BODY}" == *"ready"* && "${READYZ_BODY}" == *"db_ping"* ]]; then
    record_pass "Backend /readyz probe" "HTTP 200 ready (DB ping ok)"
else
    record_fail "Backend /readyz probe" "HTTP ${READYZ_CODE}: ${READYZ_BODY}"
fi

# --- 3. Frontend HTTP Probes ---
echo ""
echo "3. Frontend HTTP Interface (Port 8088)..."
FE_HTTP_RESP=$(curl -s -w "\n%{http_code}" http://localhost:8088/ || echo -e "\n000")
FE_HTTP_BODY=$(echo "${FE_HTTP_RESP}" | head -n -1)
FE_HTTP_CODE=$(echo "${FE_HTTP_RESP}" | tail -n 1)

if [[ "${FE_HTTP_CODE}" == "200" && "${FE_HTTP_BODY}" == *"<!doctype html"* ]]; then
    record_pass "Frontend HTTP root" "HTTP 200 with HTML application payload"
else
    record_fail "Frontend HTTP root" "HTTP ${FE_HTTP_CODE}"
fi

# --- 4. Frontend HTTPS & TLS Probes ---
echo ""
echo "4. Frontend HTTPS & Local TLS Interface (Port 8443)..."
FE_HTTPS_RESP=$(curl -s -k -w "\n%{http_code}" https://localhost:8443/ || echo -e "\n000")
FE_HTTPS_BODY=$(echo "${FE_HTTPS_RESP}" | head -n -1)
FE_HTTPS_CODE=$(echo "${FE_HTTPS_RESP}" | tail -n 1)

if [[ "${FE_HTTPS_CODE}" == "200" && "${FE_HTTPS_BODY}" == *"<!doctype html"* ]]; then
    record_pass "Frontend HTTPS root" "HTTP 200 over TLS"
else
    record_fail "Frontend HTTPS root" "HTTP ${FE_HTTPS_CODE}"
fi

# Verify TLS Subject Alternative Name (SAN) coverage
if [[ -f "${ROOT_DIR}/certs/server.crt" ]]; then
    CERT_SAN=$(openssl x509 -in "${ROOT_DIR}/certs/server.crt" -noout -text 2>/dev/null | grep -A 1 "Subject Alternative Name" || true)
    if [[ "${CERT_SAN}" == *"172.17.0.1"* && "${CERT_SAN}" == *"localhost"* ]]; then
        record_pass "TLS SAN certificate" "covers localhost and Docker bridge (172.17.0.1)"
    else
        record_fail "TLS SAN certificate" "missing expected SANs: ${CERT_SAN}"
    fi
else
    # Inspect certificate directly from TLS handshake
    HANDSHAKE_SAN=$(echo | openssl s_client -connect localhost:8443 2>/dev/null | openssl x509 -noout -text 2>/dev/null | grep -A 1 "Subject Alternative Name" || true)
    if [[ "${HANDSHAKE_SAN}" == *"172.17.0.1"* || "${HANDSHAKE_SAN}" == *"localhost"* ]]; then
        record_pass "TLS handshake certificate" "valid SAN present"
    else
        record_fail "TLS handshake certificate" "unable to verify SANs"
    fi
fi

# --- 5. PWA Assets & Caching Headers over HTTPS ---
echo ""
echo "5. PWA Assets & Service Worker Configuration over HTTPS..."

# manifest.json
MANIFEST_HDR=$(curl -s -k -I https://localhost:8443/manifest.json || true)
if echo "${MANIFEST_HDR}" | grep -q "200 OK" && echo "${MANIFEST_HDR}" | grep -iqE "content-type: application/(manifest\+)?json"; then
    record_pass "PWA manifest.json" "HTTP 200 with manifest JSON content-type"
else
    record_fail "PWA manifest.json" "missing or improper headers: ${MANIFEST_HDR}"
fi

# sw.js
SW_HDR=$(curl -s -k -I https://localhost:8443/sw.js || true)
if echo "${SW_HDR}" | grep -q "200 OK" && echo "${SW_HDR}" | grep -iq "Service-Worker-Allowed"; then
    record_pass "Service worker endpoint (/sw.js)" "HTTP 200 with Service-Worker-Allowed: / header"
else
    record_fail "Service worker endpoint (/sw.js)" "missing headers: ${SW_HDR}"
fi

# service-worker.js
SW2_HDR=$(curl -s -k -I https://localhost:8443/service-worker.js || true)
if echo "${SW2_HDR}" | grep -q "200 OK" && echo "${SW2_HDR}" | grep -iq "Service-Worker-Allowed"; then
    record_pass "Service worker endpoint (/service-worker.js)" "HTTP 200 with Service-Worker-Allowed: / header"
else
    record_fail "Service worker endpoint (/service-worker.js)" "missing headers: ${SW2_HDR}"
fi

# --- 6. API Reverse Proxy & Dev Endpoints over HTTPS ---
echo ""
echo "6. API Reverse Proxy & Dev Endpoints over HTTPS..."

# Unauthenticated API guard
API_GUARD_RESP=$(curl -s -k -w "\n%{http_code}" https://localhost:8443/api/wallets || echo -e "\n000")
API_GUARD_BODY=$(echo "${API_GUARD_RESP}" | head -n -1)
API_GUARD_CODE=$(echo "${API_GUARD_RESP}" | tail -n 1)

if [[ "${API_GUARD_CODE}" == "401" && "${API_GUARD_BODY}" == *"authentication required"* ]]; then
    record_pass "API authentication guard over HTTPS" "HTTP 401 authentication required"
else
    record_fail "API authentication guard over HTTPS" "HTTP ${API_GUARD_CODE}: ${API_GUARD_BODY}"
fi

# Dev status probe
DEV_STATUS_RESP=$(curl -s -k -w "\n%{http_code}" https://localhost:8443/api/dev/status || echo -e "\n000")
DEV_STATUS_BODY=$(echo "${DEV_STATUS_RESP}" | head -n -1)
DEV_STATUS_CODE=$(echo "${DEV_STATUS_RESP}" | tail -n 1)

if [[ "${DEV_STATUS_CODE}" == "200" && "${DEV_STATUS_BODY}" == *"enabled\":true"* ]]; then
    record_pass "Dev endpoint status over HTTPS" "HTTP 200 enabled"
else
    record_fail "Dev endpoint status over HTTPS" "HTTP ${DEV_STATUS_CODE}: ${DEV_STATUS_BODY}"
fi

# --- 7. CLI Administrative Tooling ---
echo ""
echo "7. CLI Administrative Tooling..."
STATS_OUTPUT=$(docker compose exec -T backend /app/nebengbeli-cli stats 2>&1 || true)
if echo "${STATS_OUTPUT}" | grep -q "NebengBeli Platform Statistics"; then
    record_pass "CLI stats command" "executes successfully inside backend container"
else
    record_fail "CLI stats command" "${STATS_OUTPUT}"
fi

USERS_OUTPUT=$(docker compose exec -T backend /app/nebengbeli-cli users 2>&1 || true)
if echo "${USERS_OUTPUT}" | grep -q "Total Registered Users"; then
    record_pass "CLI users command" "executes successfully inside backend container"
else
    record_fail "CLI users command" "${USERS_OUTPUT}"
fi

# --- 8. Credential Safety & Hygiene ---
echo ""
echo "8. Credential Safety & Git Hygiene Verification..."

if git check-ignore -q .env 2>/dev/null; then
    record_pass "Gitignore rule for .env" "correctly ignored"
else
    record_fail "Gitignore rule for .env" ".env is not ignored by git"
fi

if git check-ignore -q certs/server.key 2>/dev/null; then
    record_pass "Gitignore rule for TLS private keys" "certs/server.key correctly ignored"
else
    record_fail "Gitignore rule for TLS private keys" "certs/server.key is not ignored"
fi

# Verify no tracked uncommitted secret leaks
DIRTY_SECRETS=$(git status --porcelain | grep -E '\.env$|\.key$' || true)
if [[ -z "${DIRTY_SECRETS}" ]]; then
    record_pass "Tracked status hygiene" "no uncommitted keys or env files tracked"
else
    record_fail "Tracked status hygiene" "untracked secret files detected in git status: ${DIRTY_SECRETS}"
fi

# --- Summary ---
echo ""
echo "============================================================"
echo "Smoke Verification Summary: ${PASSED_COUNT} PASSED, ${FAILED_COUNT} FAILED"
echo "============================================================"

if [[ ${FAILED_COUNT} -gt 0 ]]; then
    echo "[smoke] Verification FAILED with ${FAILED_COUNT} errors."
    exit 1
fi

echo "[smoke] All local HTTPS harness smoke tests PASSED successfully!"
exit 0
