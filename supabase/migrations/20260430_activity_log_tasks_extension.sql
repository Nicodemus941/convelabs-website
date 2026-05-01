-- Extend activity_log into a hybrid notes + tasks table.
-- Owner creates a task with assigned_to_user_id set; admin's dashboard
-- filters on it and replies with parent_id so all activity threads.
-- Real-time pushes via postgres_changes subscription on the table.

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_status text CHECK (task_status IN ('open','in_progress','done','cancelled') OR task_status IS NULL),
  ADD COLUMN IF NOT EXISTS task_priority text DEFAULT 'normal' CHECK (task_priority IN ('low','normal','urgent')),
  ADD COLUMN IF NOT EXISTS task_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.activity_log(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS task_completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activity_log_assigned_open
  ON public.activity_log(assigned_to_user_id, task_status, task_priority, task_due_at)
  WHERE task_status IN ('open','in_progress');

CREATE INDEX IF NOT EXISTS idx_activity_log_parent
  ON public.activity_log(parent_id) WHERE parent_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log';
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.get_my_open_task_count()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM activity_log
  WHERE assigned_to_user_id = auth.uid()
    AND task_status IN ('open','in_progress');
$$;
GRANT EXECUTE ON FUNCTION public.get_my_open_task_count() TO authenticated;
