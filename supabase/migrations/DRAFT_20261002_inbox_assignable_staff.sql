-- ============================================================================
-- DRAFT — NOT APPLIED. Filename is deliberately outside the CLI's
-- <timestamp>_name.sql pattern so `supabase db push` ignores it. Apply by
-- hand (owner) after review, then rename to 20261002xxxxxx_inbox_assignable_staff.sql.
-- ============================================================================
--
-- Inbox workspace — schema support for Notes & tasks + Website chat.
--
-- 1. get_assignable_staff()  — the RPC NotesTab has called since 2026-04-30
--    and that never existed (404 on every page load → the "Assign to"
--    dropdown was always empty, so no task could be assigned). The frontend
--    now falls back to get_staff_activity_summary(), which works; this RPC
--    is the cheaper, purpose-built version and is picked up automatically
--    once it exists (see src/components/dashboards/admin/inbox/staff.ts).
--
-- 2. chatbot_conversations.tenant_patient_id — back-link from a website chat
--    to the patient chart it produced ("Add as patient" in Website chat).
--    The UI writes it opportunistically and ignores the error while the
--    column is missing.
--
-- 3. Indexes the Inbox screens lean on.
--
-- Everything is additive and idempotent.

-- 1 ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_assignable_staff()
RETURNS TABLE (id uuid, email text, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Admin-only: the caller must themselves be staff.
  SELECT DISTINCT ON (u.id)
    u.id,
    u.email::text,
    COALESCE(
      NULLIF(trim(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(concat_ws(' ', u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'last_name')), ''),
      NULLIF(trim(concat_ws(' ', u.raw_user_meta_data->>'firstName', u.raw_user_meta_data->>'lastName')), ''),
      (SELECT al.created_by_name FROM public.activity_log al
         WHERE al.staff_id = u.id AND al.created_by_name IS NOT NULL
         ORDER BY al.created_at DESC LIMIT 1)
    )::text AS full_name,
    min(ur.role::text) AS role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  WHERE public.is_admin()
    AND ur.role::text IN ('super_admin', 'admin', 'office_manager', 'owner')
    AND u.deleted_at IS NULL
  GROUP BY u.id, u.email, u.raw_user_meta_data
  ORDER BY u.id;
$$;

REVOKE ALL ON FUNCTION public.get_assignable_staff() FROM public;
GRANT EXECUTE ON FUNCTION public.get_assignable_staff() TO authenticated;

COMMENT ON FUNCTION public.get_assignable_staff() IS
  'Staff a task can be assigned to (super_admin/admin/office_manager/owner). Admin-gated via is_admin(). Used by the Inbox task composer.';

-- 2 ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.chatbot_conversations
  ADD COLUMN IF NOT EXISTS tenant_patient_id uuid REFERENCES public.tenant_patients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.chatbot_conversations.tenant_patient_id IS
  'Patient chart created from / matched to this website chat (Inbox › Website chat › Add as patient).';

-- 3 ───────────────────────────────────────────────────────────────────────
-- Needs-reply lane + badge: count/list rows flagged for staff.
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_staff_unread
  ON public.chatbot_conversations (last_message_at DESC)
  WHERE staff_unread = true;

-- Human-handoff lane.
CREATE INDEX IF NOT EXISTS idx_chatbot_conversations_handoff_human
  ON public.chatbot_conversations (last_message_at DESC)
  WHERE handoff_state = 'human' AND status <> 'closed';

-- Tasks sorted by due date inside the open set (overdue lane).
CREATE INDEX IF NOT EXISTS idx_activity_log_open_due
  ON public.activity_log (task_due_at)
  WHERE task_status IN ('open', 'in_progress');

-- Task source back-links (metadata.source.type / .id) for "open source" and
-- for finding every task spawned by one chat or inbox item.
CREATE INDEX IF NOT EXISTS idx_activity_log_source
  ON public.activity_log ((metadata->'source'->>'type'), (metadata->'source'->>'id'))
  WHERE metadata ? 'source';

-- Partner inquiries: Needs attention lists status='new'.
CREATE INDEX IF NOT EXISTS idx_ppi_status_created
  ON public.provider_partnership_inquiries (status, created_at DESC);
