-- Store the Stripe hosted invoice URL so reminders can link directly to payment
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_invoice_url text;
