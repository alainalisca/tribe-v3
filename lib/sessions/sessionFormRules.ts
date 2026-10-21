/**
 * T-POLISH1 PR 4: the rules a session form checks before it saves, shared by
 * /create and /session/[id]/edit. Pure: no React, no Supabase, `now` passed in.
 *
 * The database enforces two of them as well (migration 227): max_participants
 * between MIN_ATHLETES and MAX_ATHLETES, and a browser-written active one-off
 * session starting in the future. These checks run first so the host sees the
 * message in their language instead of a constraint name; serverFieldError()
 * maps the database's own refusal back onto the same field when the browser
 * check was bypassed or the clock moved between the check and the save.
 */

export const MIN_ATHLETES = 2;
/** Run clubs and events go above 100 (Al, 2026-10-21). Same bound as 227's CHECK. */
export const MAX_ATHLETES = 500;

export const SKILL_LEVELS = ['all_levels', 'beginner', 'intermediate', 'advanced'] as const;
export const GENDER_PREFERENCES = ['all', 'women_only', 'men_only'] as const;
export const JOIN_POLICIES = ['open', 'curated', 'invite_only'] as const;
export const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180] as const;

/** Bogotá is UTC-5 all year (no DST), so a fixed offset is exact. */
const BOGOTA_OFFSET = '-05:00';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export type SessionFormField =
  | 'sport'
  | 'date'
  | 'start_time'
  | 'location'
  | 'max_participants'
  | 'skill_level'
  | 'gender_preference'
  | 'join_policy'
  | 'recurrence';

export type SessionFieldError =
  | 'sport_required'
  | 'date_required'
  | 'date_past'
  | 'start_time_required'
  | 'start_time_past'
  | 'location_required'
  | 'max_participants_range'
  | 'skill_level_invalid'
  | 'gender_invalid'
  | 'join_policy_invalid'
  | 'recurrence_days_required'
  | 'recurrence_end_before_start';

export type SessionFieldErrors = Partial<Record<SessionFormField, SessionFieldError>>;

export interface SessionFormValues {
  sport: string;
  date: string;
  start_time: string;
  location: string;
  /** '' while the host is typing; a number otherwise. */
  max_participants: number | '';
  skill_level: string;
  gender_preference: string;
  join_policy: string;
}

export interface RecurrenceFormValues {
  is_recurring: boolean;
  recurrence_pattern: string;
  recurrence_end_date: string;
}

export interface SessionRuleOptions {
  /**
   * Edit only: the date and time the session had when the form loaded. The
   * "must still be ahead" rule applies to a NEW start, so an edit that leaves
   * them alone never trips it (a host fixing the description of a session that
   * starts in five minutes). 227's trigger applies the same exemption.
   */
  original?: { date: string; start_time: string } | null;
  /**
   * Edit only: a recurring parent's own date is in the past by design while the
   * cron keeps generating occurrences from it (editGuards.isEditLocked), so its
   * date and time are never checked against now.
   */
  isSeriesParent?: boolean;
}

/** The three steps PR 4b's create flow will validate one at a time. */
export type SessionFormStep = 'what' | 'when_where' | 'capacity';

export const STEP_FIELDS: Record<SessionFormStep, SessionFormField[]> = {
  what: ['sport', 'skill_level'],
  when_where: ['date', 'start_time', 'location', 'recurrence'],
  capacity: ['max_participants', 'gender_preference', 'join_policy'],
};

/** 'HH:MM' or 'HH:MM:SS' -> 'HH:MM:SS'; anything else -> null. */
function normalizeTime(time: string): string | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  return `${m[1]}:${m[2]}:${m[3] ?? '00'}`;
}

/** The instant a session starts, read as Bogotá wall-clock time. NaN if unparseable. */
export function bogotaStartMs(date: string, startTime: string): number {
  const time = normalizeTime(startTime);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return NaN;
  return Date.parse(`${date}T${time}${BOGOTA_OFFSET}`);
}

/** The calendar date in Bogotá at `now`, as 'YYYY-MM-DD'. */
export function bogotaDateOf(now: Date): string {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** True when a session at this Bogotá date and time has not started yet at `now`. */
export function startsAhead(date: string, startTime: string, now: Date): boolean {
  const ms = bogotaStartMs(date, startTime);
  return !Number.isNaN(ms) && ms > now.getTime();
}

function sameStart(a: { date: string; start_time: string }, b: { date: string; start_time: string }): boolean {
  return a.date === b.date && normalizeTime(a.start_time) === normalizeTime(b.start_time);
}

function capacityOk(value: number | ''): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_ATHLETES && value <= MAX_ATHLETES;
}

/** Every rule, keyed by the field it belongs to. Empty object = the form can save. */
export function validateSessionForm(
  values: SessionFormValues,
  recurrence: RecurrenceFormValues | null,
  now: Date,
  options: SessionRuleOptions = {}
): SessionFieldErrors {
  const errors: SessionFieldErrors = {};

  if (!values.sport.trim()) errors.sport = 'sport_required';
  if (!(SKILL_LEVELS as readonly string[]).includes(values.skill_level)) errors.skill_level = 'skill_level_invalid';

  const startUnchanged = options.original ? sameStart(values, options.original) : false;
  const checkAgainstNow = !options.isSeriesParent && !startUnchanged;
  if (!values.date) {
    errors.date = 'date_required';
  } else if (checkAgainstNow && values.date < bogotaDateOf(now)) {
    errors.date = 'date_past';
  }
  if (!values.start_time) {
    errors.start_time = 'start_time_required';
  } else if (checkAgainstNow && !errors.date && !startsAhead(values.date, values.start_time, now)) {
    errors.start_time = 'start_time_past';
  }

  if (!values.location.trim()) errors.location = 'location_required';

  if (recurrence?.is_recurring) {
    const days = recurrence.recurrence_pattern.split('_').slice(1).filter(Boolean);
    if (days.length === 0) {
      errors.recurrence = 'recurrence_days_required';
    } else if (recurrence.recurrence_end_date && values.date && recurrence.recurrence_end_date < values.date) {
      errors.recurrence = 'recurrence_end_before_start';
    }
  }

  if (!capacityOk(values.max_participants)) errors.max_participants = 'max_participants_range';
  if (!(GENDER_PREFERENCES as readonly string[]).includes(values.gender_preference))
    errors.gender_preference = 'gender_invalid';
  if (!(JOIN_POLICIES as readonly string[]).includes(values.join_policy)) errors.join_policy = 'join_policy_invalid';

  return errors;
}

/** The rules of one step only, for PR 4b's "Siguiente". */
export function validateStep(
  step: SessionFormStep,
  values: SessionFormValues,
  recurrence: RecurrenceFormValues | null,
  now: Date,
  options: SessionRuleOptions = {}
): SessionFieldErrors {
  const all = validateSessionForm(values, recurrence, now, options);
  const out: SessionFieldErrors = {};
  for (const field of STEP_FIELDS[step]) if (all[field]) out[field] = all[field];
  return out;
}

/** The fields in the order the form shows them, for "scroll to the first error". */
export const FIELD_ORDER: SessionFormField[] = [
  'sport',
  'skill_level',
  'gender_preference',
  'date',
  'start_time',
  'location',
  'max_participants',
  'join_policy',
  'recurrence',
];

export function firstErrorField(errors: SessionFieldErrors): SessionFormField | null {
  return FIELD_ORDER.find((f) => errors[f]) ?? null;
}

/** The key under messages.sessionForm for each error. */
export const ERROR_MESSAGE_KEY: Record<SessionFieldError, string> = {
  sport_required: 'sportRequired',
  date_required: 'dateRequired',
  date_past: 'datePast',
  start_time_required: 'startTimeRequired',
  start_time_past: 'startTimePast',
  location_required: 'locationRequired',
  max_participants_range: 'maxParticipantsRange',
  skill_level_invalid: 'skillLevelInvalid',
  gender_invalid: 'genderInvalid',
  join_policy_invalid: 'joinPolicyInvalid',
  recurrence_days_required: 'recurrenceDaysRequired',
  recurrence_end_before_start: 'recurrenceEndBeforeStart',
};

/**
 * 227's two refusals, read back off the error message PostgREST returns, onto
 * the field the host has to change. null for anything else.
 */
export function serverFieldError(
  message: string | null | undefined
): { field: SessionFormField; error: SessionFieldError } | null {
  if (!message) return null;
  if (message.includes('session_start_in_past')) return { field: 'start_time', error: 'start_time_past' };
  if (message.includes('sessions_max_participants_range'))
    return { field: 'max_participants', error: 'max_participants_range' };
  return null;
}

// ── Paid sessions ──────────────────────────────────────────────────────────
// The create page's paid block and the edit page's PriceSection share these
// floors and this order of checks (moved here from editGuards unchanged).

export interface PriceFormInput {
  is_paid: boolean;
  price_display: string;
  currency: 'COP' | 'USD';
  payment_instructions: string;
}

export type PriceValidationError = 'price_required' | 'min_usd' | 'min_cop' | 'instructions_required';

// USD $5 / COP 20,000 (~$5).
export const MIN_PRICE_USD = 5;
export const MIN_PRICE_COP = 20000;

export function validatePriceInput(input: PriceFormInput): PriceValidationError | null {
  if (!input.is_paid) return null;
  const price = parseFloat(input.price_display);
  if (!input.price_display || isNaN(price) || price <= 0) return 'price_required';
  if (input.currency === 'USD' && price < MIN_PRICE_USD) return 'min_usd';
  if (input.currency === 'COP' && price < MIN_PRICE_COP) return 'min_cop';
  if (!input.payment_instructions.trim()) return 'instructions_required';
  return null;
}
