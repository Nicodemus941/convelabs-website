
import { TimeRange } from './models';

/**
 * Helper function to check if two time ranges overlap
 */
export function doTimeRangesOverlap(range1: TimeRange, range2: TimeRange): boolean {
  return (
    (range1.start >= range2.start && range1.start < range2.end) ||
    (range1.end > range2.start && range1.end <= range2.end) ||
    (range1.start <= range2.start && range1.end >= range2.end)
  );
}

/**
 * Calculate time difference in minutes between two dates
 */
export function calculateTimeDifferenceMinutes(date1: Date, date2: Date): number {
  // Use valueOf for consistent primitive number conversion
  const diffMs: number = Math.abs(date1.valueOf() - date2.valueOf());
  return Math.floor(diffMs / 60000);
}

/**
 * Format date for database query
 */
export function formatDateForQuery(date: Date): { year: string, month: string, day: string } {
  const year = date.getFullYear().toString();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return { year, month, day };
}
