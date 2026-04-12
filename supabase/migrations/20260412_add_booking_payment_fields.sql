-- Add payment and tip fields to the appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tip_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_price DECIMAL(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS surcharge_amount DECIMAL(10,2) DEFAULT 0;
