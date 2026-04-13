-- Store AI chatbot questions from patients for FAQ analysis and daily digest
CREATE TABLE IF NOT EXISTS chatbot_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  question text NOT NULL,
  answer text,
  page_url text,
  patient_email text,
  patient_name text,
  booking_step text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_inquiries_created ON chatbot_inquiries(created_at DESC);

-- RLS - service role can insert (from edge functions), admins can read
ALTER TABLE chatbot_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access inquiries" ON chatbot_inquiries
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read inquiries" ON chatbot_inquiries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Anyone can insert inquiries" ON chatbot_inquiries
  FOR INSERT WITH CHECK (true);
