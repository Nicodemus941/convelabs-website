import { supabase } from '@/integrations/supabase/client';

interface ErrorLogEntry {
  error_type: 'save_failure' | 'upload_failure' | 'api_failure' | 'rls_blocked' | 'missing_column' | 'ui_error' | 'notification_failure';
  component: string;
  action: string;
  error_message: string;
  error_stack?: string;
  payload?: any;
}

/**
 * Log errors to the error_logs table for debugging and monitoring.
 * This catches silent failures that would otherwise go unnoticed.
 */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  try {
    // Get current user info
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email || 'anonymous';
    const userRole = session?.user?.user_metadata?.role || 'unknown';

    await supabase.from('error_logs' as any).insert({
      ...entry,
      user_email: userEmail,
      user_role: userRole,
      payload: entry.payload ? JSON.stringify(entry.payload) : null,
    });

    // Also log to console for immediate visibility
    console.error(`[ErrorLog] ${entry.error_type} in ${entry.component}.${entry.action}: ${entry.error_message}`);
  } catch (logErr) {
    // Don't let the error logger itself crash the app
    console.error('[ErrorLog] Failed to log error:', logErr, 'Original:', entry);
  }
}

/**
 * Wrapper for Supabase updates that detects silent failures.
 * If the update returns no rows affected, it logs a potential missing column or RLS issue.
 */
export async function safeUpdate(
  table: string,
  updates: Record<string, any>,
  filter: { column: string; value: string },
  component: string,
  action: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .update(updates)
      .eq(filter.column, filter.value)
      .select();

    if (error) {
      await logError({
        error_type: error.message.includes('row-level security') ? 'rls_blocked' : 'save_failure',
        component,
        action,
        error_message: error.message,
        payload: { table, updates, filter },
      });
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      await logError({
        error_type: 'save_failure',
        component,
        action,
        error_message: `Update returned 0 rows — possible RLS block or record not found`,
        payload: { table, updates, filter },
      });
      return { success: false, error: 'No rows updated — record may not exist or access denied' };
    }

    // Verify columns actually saved (detect missing columns)
    const saved = data[0];
    for (const [key, value] of Object.entries(updates)) {
      if (value !== null && value !== undefined && saved[key] === undefined) {
        await logError({
          error_type: 'missing_column',
          component,
          action,
          error_message: `Column "${key}" not found in table "${table}" — value was silently ignored`,
          payload: { table, column: key, attempted_value: value },
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    await logError({
      error_type: 'save_failure',
      component,
      action,
      error_message: err.message || 'Unknown error',
      payload: { table, updates, filter },
    });
    return { success: false, error: err.message };
  }
}

/**
 * Wrapper for Supabase inserts that catches silent failures.
 */
export async function safeInsert(
  table: string,
  record: Record<string, any>,
  component: string,
  action: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .insert([record])
      .select()
      .single();

    if (error) {
      await logError({
        error_type: error.message.includes('row-level security') ? 'rls_blocked' : 'save_failure',
        component,
        action,
        error_message: error.message,
        payload: { table, record },
      });
      return { success: false, error: error.message };
    }

    if (!data) {
      await logError({
        error_type: 'save_failure',
        component,
        action,
        error_message: 'Insert returned no data — RLS may have blocked it',
        payload: { table, record },
      });
      return { success: false, error: 'Insert failed silently' };
    }

    return { success: true, data };
  } catch (err: any) {
    await logError({
      error_type: 'save_failure',
      component,
      action,
      error_message: err.message || 'Unknown error',
      payload: { table, record },
    });
    return { success: false, error: err.message };
  }
}
