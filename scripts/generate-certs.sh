#!/usr/bin/env bash
# NebengBeli Local TLS Certificate Generator for Camofox E2E Harness
# Generates local self-signed certificates with SAN for localhost and Docker bridge IPs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CERTS_DIR="${ROOT_DIR}/certs"
FORCE="${1:-}"

mkdir -p "${CERTS_DIR}"

CRT_FILE="${CERTS_DIR}/server.crt"
KEY_FILE="${CERTS_DIR}/server.key"

if [[ -f "${CRT_FILE}" && -f "${KEY_FILE}" && "${FORCE}" != "--force" ]]; then
    # Verify expiration (must have at least 1 day remaining)
    if openssl x509 -checkend 86400 -noout -in "${CRT_FILE}" >/dev/null 2>&1; then
        echo "[certs] Existing certificate is valid and unexpired in ${CERTS_DIR}."
        exit 0
    fi
    echo "[certs] Existing certificate is expired or expiring soon. Regenerating..."
fi

echo "[certs] Generating local TLS certificates for NebengBeli HTTPS harness..."

# OpenSSL config with SANs for localhost, loopback, and Docker bridge IP
SAN_CONFIG=$(cat <<EOF
[req]
default_bits        = 2048
prompt              = no
default_md          = sha256
distinguished_name  = req_distinguished_name
x509_extensions     = v3_req

[req_distinguished_name]
C  = ID
ST = Jakarta
L  = Jakarta
O  = NebengBeli Local E2E
OU = Testing
CN = localhost

[v3_req]
basicConstraints     = CA:FALSE
keyUsage             = digitalSignature, keyEncipherment
extendedKeyUsage     = serverAuth
subjectAltName       = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = nebengbeli-frontend
DNS.3 = host.docker.internal
IP.1  = 127.0.0.1
IP.2  = 172.17.0.1
IP.3  = 0.0.0.0
EOF
)

TMP_CONF="$(mktemp)"
echo "${SAN_CONFIG}" > "${TMP_CONF}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "${KEY_FILE}" \
    -out "${CRT_FILE}" \
    -config "${TMP_CONF}" >/dev/null 2>&1

rm -f "${TMP_CONF}"

chmod 600 "${KEY_FILE}"
chmod 644 "${CRT_FILE}"

echo "[certs] Successfully generated TLS certificate and key in ${CERTS_DIR}."
