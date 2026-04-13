-- Post-Visit Automated Sequences
CREATE TABLE IF NOT EXISTS post_visit_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  patient_id uuid,
  patient_email text,
  patient_phone text,
  step text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pvs_pending ON post_visit_sequences(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pvs_appointment ON post_visit_sequences(appointment_id);

-- Referral Codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text UNIQUE NOT NULL,
  discount_amount numeric DEFAULT 25,
  referrer_credit numeric DEFAULT 25,
  uses integer DEFAULT 0,
  max_uses integer DEFAULT 50,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id uuid REFERENCES referral_codes(id),
  referred_user_id uuid,
  referred_email text,
  appointment_id uuid,
  discount_applied numeric,
  referrer_credited boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);

-- Abandoned Bookings
CREATE TABLE IF NOT EXISTS abandoned_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  phone text,
  service_type text,
  selected_date text,
  selected_time text,
  step_reached integer,
  recovery_sent boolean DEFAULT false,
  recovered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE post_visit_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access pvs" ON post_visit_sequences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Authenticated read pvs" ON post_visit_sequences FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access referrals" ON referral_codes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can read active referral codes" ON referral_codes FOR SELECT USING (active = true);
CREATE POLICY "Users can insert own codes" ON referral_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access redemptions" ON referral_redemptions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can insert redemptions" ON referral_redemptions FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role full access abandoned" ON abandoned_bookings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Anyone can insert abandoned" ON abandoned_bookings FOR INSERT WITH CHECK (true);
