/**
 * setupDatabaseFunctions — DEPRECATED no-op.
 *
 * Originally tried to CREATE the get_scheduled_campaigns() and
 * delete_scheduled_campaign() helpers at runtime via
 * `supabaseClient.sql\`...\`` — but `.sql()` is not a method on
 * supabase-js (it exists in some other client libs). Every call
 * threw `supabaseClient.sql is not a function` and produced a 500,
 * which silently broke the 15-min process-scheduled-campaigns cron
 * for who-knows-how-long.
 *
 * The two helper functions are now created via the
 * scheduled_campaigns_helper_functions migration (2026-04-28).
 * This file remains as a no-op so existing imports don't break.
 * Safe to remove the imports + this file in a follow-up cleanup.
 */
export const setupDatabaseFunctions = async (_supabaseClient: unknown): Promise<void> => {
  // No-op. See header comment.
  return;
};
