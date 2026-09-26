import { parse, isValid, format } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DateResult = { date: string; error?: never } | { date?: never; error: string };

type DateTimeResult = { datetime: string; error?: never } | { datetime?: never; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a Date in a given IANA timezone as YYYY-MM-DD. */
function formatDateInTz(d: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Build a Date representing "YYYY-MM-DD HH:mm:ss" in the given timezone,
 * returning the UTC instant as a Date.
 */
function dateFromTzComponents(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number,
  timezone: string
): Date {
  // Start with a rough UTC guess, then adjust for the offset in that timezone.
  const rough = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Determine the offset at that rough instant
  const utcStr = rough.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = rough.toLocaleString('en-US', { timeZone: timezone });
  const utcMs = new Date(utcStr).getTime();
  const tzMs = new Date(tzStr).getTime();
  const offsetMs = tzMs - utcMs;

  return new Date(rough.getTime() - offsetMs);
}

// ---------------------------------------------------------------------------
// Date format detection
// ---------------------------------------------------------------------------

export type SlashFormat = 'dm' | 'md';

function isUSTimezone(tz: string): boolean {
  return (
    tz.startsWith('America/New_York') ||
    tz.startsWith('America/Chicago') ||
    tz.startsWith('America/Denver') ||
    tz.startsWith('America/Los_Angeles') ||
    tz.startsWith('America/Phoenix') ||
    tz.startsWith('America/Anchorage') ||
    tz.startsWith('Pacific/Honolulu') ||
    tz.startsWith('US/')
  );
}

export type DateFormatResult = { format: SlashFormat; error?: never } | { format?: never; error: 'conflict' };

/**
 * Scan all slash-format values in a column and determine whether the column
 * is DD/MM/YYYY or MM/DD/YYYY.
 *
 * - If any value has first part > 12, the column is DD/MM.
 * - If any value has second part > 12, the column is MM/DD.
 * - If both happen, it is a conflict error.
 * - If neither (all values are ambiguous), default by timezone.
 */
export function detectDateFormat(values: string[], timezone: string): DateFormatResult {
  let seenFirstGt12 = false;
  let seenSecondGt12 = false;

  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a > 12) seenFirstGt12 = true;
    if (b > 12) seenSecondGt12 = true;
  }

  if (seenFirstGt12 && seenSecondGt12) return { error: 'conflict' };
  if (seenFirstGt12) return { format: 'dm' };
  if (seenSecondGt12) return { format: 'md' };

  // All ambiguous — default by locale
  if (isUSTimezone(timezone)) return { format: 'md' };
  return { format: 'dm' };
}

// ---------------------------------------------------------------------------
// parseImportDate
// ---------------------------------------------------------------------------

/**
 * Parse a raw date string into a YYYY-MM-DD calendar date.
 *
 * Accepted formats:
 *   - ISO:       2026-09-24  or  2026-09-24T14:00:00
 *   - A/B/YYYY:  interpreted as DD/MM or MM/DD based on `slashFormat`.
 *
 * `slashFormat` must be determined per-column before calling this function,
 * using `detectDateFormat()`.
 */
export function parseImportDate(
  raw: string | null | undefined,
  timezone: string,
  slashFormat: SlashFormat = 'dm'
): DateResult {
  if (raw == null || raw.trim() === '') {
    return { error: 'empty' };
  }

  const trimmed = raw.trim();

  // --- Slash format (DD/MM/YYYY or MM/DD/YYYY) ----------------------------
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const yearNum = parseInt(slashMatch[3], 10);

    const dayNum = slashFormat === 'dm' ? a : b;
    const monthNum = slashFormat === 'dm' ? b : a;

    // Validate the calendar date
    const candidate = new Date(yearNum, monthNum - 1, dayNum);
    if (
      candidate.getFullYear() !== yearNum ||
      candidate.getMonth() !== monthNum - 1 ||
      candidate.getDate() !== dayNum
    ) {
      return { error: 'invalid_format' };
    }

    const yyyy = String(yearNum).padStart(4, '0');
    const mm = String(monthNum).padStart(2, '0');
    const dd = String(dayNum).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}` };
  }

  // --- ISO date (YYYY-MM-DD) or datetime (YYYY-MM-DDThh:mm:ss...) ---------
  const isoDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const d = parse(trimmed, 'yyyy-MM-dd', new Date());
    if (!isValid(d)) return { error: 'invalid_format' };
    if (format(d, 'yyyy-MM-dd') !== trimmed) return { error: 'invalid_format' };
    return { date: trimmed };
  }

  const isoDateTime = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2})?/);
  if (isoDateTime) {
    const d = new Date(trimmed);
    if (!isValid(d) || isNaN(d.getTime())) return { error: 'invalid_format' };
    return { date: formatDateInTz(d, timezone) };
  }

  return { error: 'invalid_format' };
}

// ---------------------------------------------------------------------------
// parseImportDateTime
// ---------------------------------------------------------------------------

/**
 * Combine a date string + optional time string into an ISO timestamptz.
 *
 * If no time is provided, defaults to 12:00:00 in the given timezone.
 */
export function parseImportDateTime(
  raw: string | null | undefined,
  timeRaw: string | undefined,
  timezone: string,
  slashFormat: SlashFormat = 'dm'
): DateTimeResult {
  const dateResult = parseImportDate(raw, timezone, slashFormat);
  if (dateResult.error) return { error: dateResult.error };

  let hours = 12;
  let minutes = 0;
  let seconds = 0;

  if (timeRaw != null && timeRaw.trim() !== '') {
    const t = timeRaw.trim();
    const timeMatch = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!timeMatch) return { error: 'invalid_format' };
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;

    if (hours > 23 || minutes > 59 || seconds > 59) {
      return { error: 'invalid_format' };
    }
  }

  const [y, m, d] = dateResult.date!.split('-').map(Number);
  const utcDate = dateFromTzComponents(y, m, d, hours, minutes, seconds, timezone);

  return { datetime: utcDate.toISOString() };
}

// ---------------------------------------------------------------------------
// matchMemberOrder
// ---------------------------------------------------------------------------

/**
 * Documents the resolution order when matching imported rows to members:
 * external_id first, then exact email, then exact phone.
 */
export function matchMemberOrder(): string[] {
  return ['external_id', 'email', 'phone'];
}

// ---------------------------------------------------------------------------
// normalizeStatus
// ---------------------------------------------------------------------------

export function normalizeStatus(raw: string | undefined): {
  status: string;
  tags: string[];
  warning?: string;
} {
  if (!raw) return { status: 'active', tags: [] };
  const lower = raw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (lower === 'activo' || lower === 'active') return { status: 'active', tags: [] };
  if (lower === 'inactivo' || lower === 'inactive') return { status: 'inactive', tags: [] };
  if (lower === 'congelado' || lower === 'frozen') return { status: 'inactive', tags: ['congelado'] };
  return { status: 'active', tags: [], warning: `unknown_status: ${raw}` };
}
