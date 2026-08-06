alter table public.booking_prefill_tokens
  add column if not exists household_members_json jsonb not null default '[]'::jsonb;
