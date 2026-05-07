#!/usr/bin/env bash
# ConveLabs — outstanding edge-function deploys (May 5-7 2026 work)
#
# Run from the repo root:
#   bash DEPLOY_NOW.sh
#
# What's pending (in priority order — top is most user-impacting):
#
#   1. send-appointment-reminder    — Hawthorn weekday bug. Patients are
#      send-appointment-reminders     getting "tomorrow Thursday" reminders
#                                     for Friday visits TODAY. Highest urgency.
#
#   2. ocr-lab-order               — DOB extraction from doctor's lab
#      create-lab-request            order. Closes the "no DOB on file"
#                                     gate-lockout pipeline.
#
#   3. stripe-webhook              — insurance + DOB persistence on every
#      create-appointment-checkout   patient booking. Today only 1/495
#                                     online-booked patients in last 30d
#                                     have insurance_card_path on file.
#                                     Going forward this fixes that.
#
#   4. reconcile-stripe-payments   — Elite Medical org-pay classifier.
#                                     Future org-pay charges no longer
#                                     flag as orphaned.
#
#   5. process-post-visit-sequences — date format helper migration
#      send-specimen-delivery-notification
#                                     (lower urgency — post-visit-only)
#
# All 9 deploy in ~30 seconds total.

set -e
PROJECT_REF="yluyonhrxxtyuiyrdixl"

echo "→ Deploying 9 edge functions to $PROJECT_REF"
echo

supabase functions deploy \
  send-appointment-reminder \
  send-appointment-reminders \
  ocr-lab-order \
  create-lab-request \
  stripe-webhook \
  create-appointment-checkout \
  reconcile-stripe-payments \
  process-post-visit-sequences \
  send-specimen-delivery-notification \
  --project-ref "$PROJECT_REF"

echo
echo "✓ Deploy complete. Verify with:"
echo "  supabase functions list --project-ref $PROJECT_REF | head"
