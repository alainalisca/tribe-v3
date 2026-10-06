/**
 * T-AV26. The gym's program settings: which athlete_programs columns the
 * owner may edit, and the validation the settings route applies before the
 * database sees anything.
 *
 * AN ALLOWLIST, NOT A FILTER. parseProgramSettings builds its result from the
 * keys below and nothing else, so `partner_id`, `is_active` or any other key in
 * the request body is never forwarded (mass assignment). is_active stays an
 * admin-only switch behind its trigger (8201).
 *
 * The numeric ranges repeat the table's CHECK constraints (8201) so the route
 * can answer 400 with the field name; the database remains the rule.
 */

export const TEXT_FIELDS = [
  'welcome_offer_en',
  'welcome_offer_es',
  'showup_reward_en',
  'showup_reward_es',
  'class_access_en',
  'class_access_es',
  'conversion_bonus_note_en',
  'conversion_bonus_note_es',
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];

/** Field, minimum, maximum, and whether empty means NULL. Mirrors 8201's CHECKs. */
export const NUMBER_FIELDS = [
  { key: 'conversion_bonus_cop', min: 0, max: 5_000_000, optional: true },
  { key: 'retention_days', min: 7, max: 180, optional: false },
  { key: 'promote_at_showups', min: 1, max: 100, optional: false },
  { key: 'max_athletes', min: 1, max: 50, optional: false },
] as const;

export type NumberField = (typeof NUMBER_FIELDS)[number]['key'];

export const DATE_FIELDS = ['pilot_starts_on', 'pilot_ends_on'] as const;
export type DateField = (typeof DATE_FIELDS)[number];

/** Longest free text accepted for any one field. */
export const MAX_TEXT = 500;

export interface ProgramSettings {
  welcome_offer_en: string | null;
  welcome_offer_es: string | null;
  showup_reward_en: string | null;
  showup_reward_es: string | null;
  class_access_en: string | null;
  class_access_es: string | null;
  conversion_bonus_note_en: string | null;
  conversion_bonus_note_es: string | null;
  conversion_bonus_cop: number | null;
  retention_days: number;
  promote_at_showups: number;
  max_athletes: number;
  pilot_starts_on: string | null;
  pilot_ends_on: string | null;
}

export type ParseResult = { ok: true; value: ProgramSettings } | { ok: false; field: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Validate a request body. Every field is required in the body; empty text is NULL. */
export function parseProgramSettings(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;

  const text = {} as Record<TextField, string | null>;
  for (const key of TEXT_FIELDS) {
    const v = b[key];
    if (v !== null && typeof v !== 'string') return { ok: false, field: key };
    const trimmed = typeof v === 'string' ? v.trim() : '';
    if (trimmed.length > MAX_TEXT) return { ok: false, field: key };
    text[key] = trimmed === '' ? null : trimmed;
  }

  const num = {} as Record<NumberField, number | null>;
  for (const f of NUMBER_FIELDS) {
    const v = b[f.key];
    if ((v === null || v === '') && f.optional) {
      num[f.key] = null;
      continue;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < f.min || v > f.max) return { ok: false, field: f.key };
    num[f.key] = v;
  }

  const date = {} as Record<DateField, string | null>;
  for (const key of DATE_FIELDS) {
    const v = b[key];
    if (v === null || v === '') {
      date[key] = null;
      continue;
    }
    if (typeof v !== 'string' || !isRealDate(v)) return { ok: false, field: key };
    date[key] = v;
  }

  if (date.pilot_starts_on && date.pilot_ends_on && date.pilot_ends_on < date.pilot_starts_on) {
    return { ok: false, field: 'pilot_ends_on' };
  }

  // Required numbers were checked above; `?? fallback` only satisfies the type.
  return {
    ok: true,
    value: {
      ...text,
      conversion_bonus_cop: num.conversion_bonus_cop,
      retention_days: num.retention_days ?? 30,
      promote_at_showups: num.promote_at_showups ?? 10,
      max_athletes: num.max_athletes ?? 5,
      ...date,
    },
  };
}

/**
 * The form's starting values: the program row partner_summary returned to an
 * owner or admin. Every key of ProgramSettings is filled, so a save never
 * blanks a column the form did not load (CLAUDE.md, "A PATCH whose payload is
 * built from component state").
 */
export function settingsFromProgram(p: {
  welcome_offer_en: string | null;
  welcome_offer_es: string | null;
  showup_reward_en: string | null;
  showup_reward_es: string | null;
  class_access_en: string | null;
  class_access_es: string | null;
  conversion_bonus_note_en?: string | null;
  conversion_bonus_note_es?: string | null;
  conversion_bonus_cop?: number | null;
  retention_days: number;
  promote_at_showups: number;
  max_athletes: number;
  pilot_starts_on: string | null;
  pilot_ends_on: string | null;
}): ProgramSettings {
  return {
    welcome_offer_en: p.welcome_offer_en,
    welcome_offer_es: p.welcome_offer_es,
    showup_reward_en: p.showup_reward_en,
    showup_reward_es: p.showup_reward_es,
    class_access_en: p.class_access_en,
    class_access_es: p.class_access_es,
    conversion_bonus_note_en: p.conversion_bonus_note_en ?? null,
    conversion_bonus_note_es: p.conversion_bonus_note_es ?? null,
    conversion_bonus_cop: p.conversion_bonus_cop ?? null,
    retention_days: p.retention_days,
    promote_at_showups: p.promote_at_showups,
    max_athletes: p.max_athletes,
    pilot_starts_on: p.pilot_starts_on,
    pilot_ends_on: p.pilot_ends_on,
  };
}
