#!/bin/bash
# Run after every deploy to confirm all environments are live and in sync.
# Usage: bash scripts/verify-deploy.sh

BACKEND="https://rykeai-backend.onrender.com"
FRONTEND="https://ryke-ai.vercel.app"
ORIGIN="https://ryke-ai.vercel.app"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; FAILED=1; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }

FAILED=0

echo ""
echo "========================================"
echo "  RYKE AI — Deployment Verification"
echo "========================================"
echo ""

# 1. Backend health
echo "1. Backend health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/v1/health")
if [ "$STATUS" = "200" ]; then ok "Backend is up (HTTP 200)"
else fail "Backend health returned HTTP $STATUS"; fi

# 2. CORS — PATCH allowed
echo ""
echo "2. CORS — PATCH method"
METHODS=$(curl -s -X OPTIONS "$BACKEND/v1/admin/users/x/status" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type,x-internal-key" \
  -D - 2>&1 | grep -i "access-control-allow-methods" | tr -d '\r\n')
if echo "$METHODS" | grep -q "PATCH"; then ok "PATCH allowed in CORS"
else fail "PATCH missing from CORS: $METHODS"; fi

# 3. New endpoints exist
echo ""
echo "3. Key endpoints"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/v1/onboarding/check-phone?phone=%2B15550001234")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ]; then ok "check-phone endpoint exists"
else fail "check-phone missing (HTTP $STATUS) — Render may not have deployed yet"; fi

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND/v1/admin/settings" \
  -H "x-internal-key: dev_internal_key_change_before_production_use_32c")
if [ "$STATUS" = "200" ]; then ok "admin/settings endpoint exists"
else fail "admin/settings missing (HTTP $STATUS)"; fi

# 4. Frontend reachable
echo ""
echo "4. Frontend"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND")
if [ "$STATUS" = "200" ]; then ok "Frontend is up (HTTP 200)"
else fail "Frontend returned HTTP $STATUS"; fi

# Summary
echo ""
echo "========================================"
if [ "$FAILED" = "0" ]; then
  echo -e "${GREEN}  All checks passed — deploy is live${NC}"
else
  echo -e "${RED}  Some checks failed — Render may still be deploying${NC}"
  echo "  Wait 2 min and re-run: bash scripts/verify-deploy.sh"
fi
echo "========================================"
echo ""
