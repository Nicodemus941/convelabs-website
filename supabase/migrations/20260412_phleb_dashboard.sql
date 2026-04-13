-- Add phone column to staff_profiles for phlebotomist SMS notifications
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS phone text;

-- SMS Conversations table for 2-way messaging between phlebotomists and patients
CREATE TABLE IF NOT EXISTS sms_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_profile_id uuid REFERENCES staff_profiles(id) NOT NULL,
  patient_id uuid NOT NULL,
  patient_phone text NOT NULL,
  staff_phone text,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- SMS Messages table for individual messages within conversations
CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES sms_conversations(id) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  twilio_message_sid text,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_conversations_staff ON sms_conversations(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_patient ON sms_conversations(patient_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation ON sms_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages(created_at DESC);

-- RLS
ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage own conversations" ON sms_conversations
  FOR ALL USING (
    staff_profile_id IN (SELECT id FROM staff_profiles WHERE user_id = auth.uid())
    OR auth.uid() IN (SELECT user_id FROM staff_profiles WHERE id IN (
      SELECT id FROM staff_profiles WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Staff can manage messages in own conversations" ON sms_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM sms_conversations WHERE staff_profile_id IN (
        SELECT id FROM staff_profiles WHERE user_id = auth.uid()
      )
    )
  );

-- Allow service role full access for edge functions
CREATE POLICY "Service role full access conversations" ON sms_conversations
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access messages" ON sms_messages
  FOR ALL USING (auth.role() = 'service_role');

-- Enable realtime for live chat
ALTER PUBLICATION supabase_realtime ADD TABLE sms_messages;
