#!/usr/bin/env bash
# Runs after every deploy. Pings every public edge fn and fails if any returns
# 401 (the "verify_jwt got flipped" silent-regression signal).
#
# Usage: bash scripts/smoke.sh
# Exit code: 0 if all pass, 1 if any 401 detected.

set -e
SUPABASE_URL="https://yluyonhrxxtyuiyrdixl.supabase.co"

declare -a PUBLIC_FNS=(
  "get-lab-request"
  "get-lab-request-slots"
  "schedule-lab-request"
  "unlock-lab-request-slot"
  "stripe-webhook"
  "twilio-inbound-sms"
  "send-password-reset"
  "provider-otp-send"
  "send-fasting-reminders"
  "remind-lab-request-patients"
)

FAIL=0
for FN in "${PUBLIC_FNS[@]}"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    "${SUPABASE_URL}/functions/v1/${FN}" \
    -H "Content-Type: application/json" \
    -d '{}')
  if [ "$CODE" = "401" ]; then
    echo "❌ ${FN}: 401 — verify_jwt regressed, redeploy with --no-verify-jwt"
    FAIL=1
  else
    echo "✓ ${FN}: ${CODE}"
  fi
done

if [ $FAIL -ne 0 ]; then
  echo ""
  echo "SMOKE TEST FAILED. Run this to fix:"
  echo ""
  echo "  npx supabase functions deploy \\"
  for FN in "${PUBLIC_FNS[@]}"; do
    echo "    ${FN} \\"
  done
  echo "    --project-ref yluyonhrxxtyuiyrdixl --no-verify-jwt"
  exit 1
fi
echo ""
echo "✓ All public endpoints healthy."
