# Functions that MUST be deployed with `--no-verify-jwt`

These are called from public/anonymous contexts. Re-deploying any of them
without `--no-verify-jwt` will break the customer-facing flow (401s silently
hidden behind empty-state UIs).

## The list

| Function | Why public |
|---|---|
| `stripe-webhook` | Stripe POSTs events — no JWT, signature-verified instead |
| `get-lab-request` | Patient opens `/lab-request/:token` — no auth |
| `get-lab-request-slots` | Patient picks a date — no auth |
| `schedule-lab-request` | Patient submits booking — no auth |
| `unlock-lab-request-slot` | Patient joins membership + books — no auth (token is the gate) |
| `twilio-inbound-sms` | Twilio webhook — no JWT |
| `twilio-voice-greeting` | Twilio webhook — no JWT |
| `send-fasting-reminders` | pg_cron via `net.http_post` — no JWT |
| `remind-lab-request-patients` | pg_cron via `net.http_post` — no JWT |
| `backfill-provider-phone-auth` | one-shot ops tool — no JWT |
| `provider-otp-send` | public (pre-login SMS OTP send) |
| `provider-otp-verify` | public (pre-login SMS OTP verify) |
| `member-otp-send` | public (member self-verify to unlock tier slots on booking page) |
| `member-otp-verify` | public (verifies the 6-digit SMS code, issues signed unlock token) |
| `send-password-reset` | public (unauthenticated users forgot password) |
| `update-user-password` | public (password reset completion — token-gated) |
| `dev-test-lab-sms` | dev-only — protected by a shared secret in body |
| `dev-twilio-recent` | dev-only — protected by a shared secret in body |

## Correct deploy command

```bash
npx supabase functions deploy <name> --project-ref yluyonhrxxtyuiyrdixl --no-verify-jwt
```

## What breaks if the flag is forgotten

- Patient lab-request page shows "No open slots on this date" (edge fn 401,
  client swallows error, empty slots array)
- Patient cannot book (schedule-lab-request 401, generic "Failed to schedule")
- SMS reply-to-book breaks (Twilio webhook 401, Twilio retries fail)
- Fasting reminders silently skip (cron 401, no one notices until a patient
  shows up un-fasted)
- pg_cron entries silently fail (check `cron.job_run_details`)

## Also note

- `verify_jwt` is a per-function setting on Supabase's side. Once flipped
  via deploy flag, it persists UNTIL you deploy again with the opposite
  flag. You cannot toggle it via the CLI without re-deploying.
- When in doubt, re-deploy with `--no-verify-jwt` explicitly.

Last regression: 2026-04-18, commit ef9b6ec — deployed without the flag,
silently broke the patient slot-availability view until caught.

Second regression caught same day: stripe-webhook ALSO flipped to
verify_jwt=true. Stripe itself doesn't send Supabase JWTs, so every
incoming invoice.paid / invoice.payment_succeeded / checkout.session.completed
event returned 401 UNAUTHORIZED_NO_AUTH_HEADER from our side. Real customer
payments were silently not reaching our database. Stripe retries these for
~3 days so some events may still be replayed when stripe-webhook went
public again — no permanent data loss, but a good chunk of transient
invisible failure.

THIRD regression: 2026-04-20 ~15:00 ET. Supabase MCP `deploy_edge_function`
default behavior silently sets verify_jwt=true on every redeploy (the API
default). This was triggered during an in-session deploy and caught by the
smoke-test cron within minutes. Redeployed via CLI with --no-verify-jwt —
endpoint back to 400 (signature check) instead of 401 (auth reject). No
customer payment was lost; Stripe's 3-day retry cadence covered the gap.

RULE: NEVER use MCP `deploy_edge_function` for any function in the table
above. MCP deploys default to verify_jwt=true and there is no per-deploy
override flag. Always use `npx supabase functions deploy <name>
--no-verify-jwt` for these.

## One-liner to redeploy ALL public edge fns

```bash
npx supabase functions deploy \
  stripe-webhook twilio-inbound-sms twilio-voice-greeting \
  send-password-reset update-user-password \
  send-fasting-reminders remind-lab-request-patients \
  backfill-provider-phone-auth provider-otp-send provider-otp-verify \
  get-lab-request get-lab-request-slots schedule-lab-request unlock-lab-request-slot \
  dev-test-lab-sms dev-twilio-recent \
  --project-ref yluyonhrxxtyuiyrdixl --no-verify-jwt
```
