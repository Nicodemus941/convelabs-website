-- Per-campaign attribution for /partner-with-us inquiries.
-- referral_source already holds utm_source; these capture which post or
-- DM automation sent the practice, so social content can be measured.
alter table public.provider_partnership_inquiries
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text;
