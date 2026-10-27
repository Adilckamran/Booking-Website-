/**
 * Power Padel Arena - Timezone and Calendar Date Utilities
 * 
 * Official club location: PECHS, Karachi, Pakistan.
 * Official business timezone: Asia/Karachi (Pakistan Standard Time, PKT, UTC+5).
 * 
 * Ensures all booking calendar calculations, rolling date windows, and backend
 * date validations operate strictly in Pakistan Standard Time regardless of
 * the client browser's device timezone or server runtime environment (e.g. UTC).
 */

export const PAKISTAN_TIMEZONE = 'Asia/Karachi';

export interface CalendarDateItem {
  iso: string;        // 'YYYY-MM-DD' e.g. '2026-10-28'
  dayName: string;    // 'Today', 'Tomorrow', 'Thu', etc.
  formatted: string;  // 'Oct 28'
}

/**
 * Extracts year, month, and day components of a given instant (or current time)
 * strictly in the Asia/Karachi timezone.
 */
export function getKarachiDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value || '1970', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value || '1', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10);

  return { year, month, day };
}

/**
 * Returns the current date in Karachi as standard 'YYYY-MM-DD'.
 * Uses 'en-CA' locale which outputs the standard ISO-8601 date representation.
 */
export function getKarachiDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Generates the rolling calendar window (default 7 days) starting from today in Karachi.
 * 
 * Guarantees:
 * 1. Day 0 ('Today') reflects the actual business date in Karachi (UTC+5),
 *    never shifting backward between midnight and 5:00 AM PKT.
 * 2. Day 1 is 'Tomorrow', followed by 3-letter weekday abbreviations.
 * 3. Does not depend on the visitor's local machine timezone.
 */
export function getKarachiRollingDates(
  days: number = 7,
  fromDateOrIso: Date | string = new Date()
): CalendarDateItem[] {
  let year: number;
  let month: number;
  let day: number;

  if (typeof fromDateOrIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fromDateOrIso)) {
    const parts = fromDateOrIso.split('-').map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else {
    const d = typeof fromDateOrIso === 'string' ? new Date(fromDateOrIso) : fromDateOrIso;
    const parts = getKarachiDateParts(d);
    year = parts.year;
    month = parts.month;
    day = parts.day;
  }

  const dates: CalendarDateItem[] = [];

  for (let i = 0; i < days; i++) {
    // Construct UTC noon date to prevent any DST/day-boundary shifts
    const dt = new Date(Date.UTC(year, month - 1, day + i, 12, 0, 0));
    const iso = dt.toISOString().split('T')[0];
    const dayName =
      i === 0
        ? 'Today'
        : i === 1
        ? 'Tomorrow'
        : dt.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    const formatted = dt.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

    dates.push({ iso, dayName, formatted });
  }

  return dates;
}

/**
 * Checks whether a requested YYYY-MM-DD date string is strictly prior to today in Karachi.
 */
export function isDateInPastInKarachi(dateStr: string, referenceDate: Date = new Date()): boolean {
  const todayInKarachi = getKarachiDateString(referenceDate);
  return dateStr < todayInKarachi;
}

/**
 * Formats a timestamp into human-readable Pakistan local time string (e.g. "10/28/2026, 1:30 AM PKT")
 */
export function formatKarachiDateTime(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString('en-US', {
    timeZone: PAKISTAN_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
