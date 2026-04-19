# Functions that MUST be deployed with `--no-verify-jwt`

These are called from public/anonymous contexts. Re-deploying any of them
without `--no-verify-jwt` will break the customer-facing flow (401s silently
hidden behind empty-state UIs).

## The list

| Function | Why public |
|---|---|
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
