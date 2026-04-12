
import { supabase } from "./client";

/**
 * Helper function to execute Supabase queries with simplified typing
 * This helps avoid "Type instantiation is excessively deep" errors
 */
export async function executeQuery<T extends Record<string, any>>(
  tableName: string, 
  queryBuilder: (query: any) => any
): Promise<{ data: T[] | null; error: Error | null }> {
  try {
    // Start with the base query from the table
    // Use type assertion (as any) to bypass TypeScript's strict table name checking
    const baseQuery = supabase.from(tableName as any);
    
    // Apply the query modifications from the callback
    const result = await queryBuilder(baseQuery);
    
    // Return a simplified result with explicit typing
    return {
      data: result.data as T[] | null,
      error: result.error
    };
  } catch (error) {
    console.error(`Error executing query on ${tableName}:`, error);
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Simplified fetch for a single table with common options
 */
export async function fetchRecords<T extends Record<string, any>>({
  table,
  columns = "*",
  filters = {},
  order = null,
  limit = null
}: {
  table: string;
  columns?: string;
  filters?: Record<string, any>;
  order?: { column: string; ascending: boolean } | null;
  limit?: number | null;
}): Promise<{ data: T[] | null; error: Error | null }> {
  return executeQuery<T>(table, (query) => {
    let modifiedQuery = query.select(columns);
    
    // Apply all filters
    Object.entries(filters).forEach(([key, value]) => {
      if (key.includes('like_')) {
        const column = key.replace('like_', '');
        modifiedQuery = modifiedQuery.like(column, value);
      } else if (key.includes('not_')) {
        const column = key.replace('not_', '');
        modifiedQuery = modifiedQuery.not(column, 'eq', value);
      } else {
        modifiedQuery = modifiedQuery.eq(key, value);
      }
    });
    
    // Apply ordering if specified
    if (order) {
      modifiedQuery = modifiedQuery.order(order.column, { ascending: order.ascending });
    }
    
    // Apply limit if specified
    if (limit) {
      modifiedQuery = modifiedQuery.limit(limit);
    }
    
    return modifiedQuery;
  });
}
