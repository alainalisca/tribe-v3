/**
 * T-POLISH1 PR 4b: the unpublished /create form, kept on this device so going
 * back a step, leaving the page or reloading never loses what the host typed.
 *
 * localStorage, one key per user (`tribe:create-draft:v1:<userId>`), so a
 * second account on the same phone never sees someone else's draft. Nothing
 * goes to the database and nothing crosses devices.
 *
 * NEVER A PAYMENT FIELD. toDraft() builds the draft from an allow-list, so
 * is_paid, the price, the currency and the payment instructions cannot reach
 * storage however the form state grows. A restored draft always starts free;
 * an instructor turns the paid block on again on step 3.
 *
 * Pure apart from the Storage passed in, which may be missing or throw
 * (private mode, blocked site data): every access is guarded and a failure
 * reads as "no draft".
 */

import type { GymIdentity } from '@/lib/dal/gymVenue';
import { bogotaDateOf, startsAhead, type RecurrenceFormValues } from './sessionFormRules';

export const DRAFT_VERSION = 1;
/** Older than this, a draft is dropped on read. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function draftKey(userId: string): string {
  return `tribe:create-draft:v${DRAFT_VERSION}:${userId}`;
}

/** The form fields a draft may hold. Payment fields are not in this type. */
export interface DraftFields {
  sport: string;
  date: string;
  start_time: string;
  duration: number;
  location: string;
  latitude: number | null;
  longitude: number | null;
  description: string;
  max_participants: number | '';
  join_policy: string;
  skill_level: string;
  gender_preference: string;
  is_test: boolean;
}

export const DRAFT_FIELD_NAMES: ReadonlyArray<keyof DraftFields> = [
  'sport',
  'date',
  'start_time',
  'duration',
  'location',
  'latitude',
  'longitude',
  'description',
  'max_participants',
  'join_policy',
  'skill_level',
  'gender_preference',
  'is_test',
];

export interface CreateDraft {
  v: typeof DRAFT_VERSION;
  savedAt: number;
  step: 1 | 2 | 3;
  fields: DraftFields;
  recurring: RecurrenceFormValues;
  photos: string[];
  venue: GymIdentity | null;
}

export interface DraftSource {
  form: DraftFields & Record<string, unknown>;
  recurring: RecurrenceFormValues;
  step: 1 | 2 | 3;
  photos: string[];
  venue: GymIdentity | null;
}

/** The allow-listed snapshot of the form. Anything not named above is dropped. */
export function toDraft(source: DraftSource, now: Date): CreateDraft {
  const fields = {} as Record<keyof DraftFields, unknown>;
  for (const name of DRAFT_FIELD_NAMES) fields[name] = source.form[name];
  return {
    v: DRAFT_VERSION,
    savedAt: now.getTime(),
    step: source.step,
    fields: fields as unknown as DraftFields,
    recurring: {
      is_recurring: source.recurring.is_recurring,
      recurrence_pattern: source.recurring.recurrence_pattern,
      recurrence_end_date: source.recurring.recurrence_end_date,
    },
    photos: [...source.photos],
    venue: source.venue,
  };
}

/** Worth keeping: the host has entered something a blank form does not have. */
export function hasContent(draft: CreateDraft): boolean {
  const f = draft.fields;
  return !!(
    f.sport ||
    f.date ||
    f.start_time ||
    f.location.trim() ||
    f.description.trim() ||
    draft.photos.length ||
    draft.venue ||
    draft.recurring.is_recurring
  );
}

/**
 * A stored draft brought up to now: a date that has passed is cleared with its
 * time, and a time today that has passed is cleared on its own, so a restored
 * form never offers a start the rules would refuse.
 */
export function freshen(draft: CreateDraft, now: Date): CreateDraft {
  const f = { ...draft.fields };
  if (f.date && f.date < bogotaDateOf(now)) {
    f.date = '';
    f.start_time = '';
  } else if (f.date && f.start_time && !startsAhead(f.date, f.start_time, now)) {
    f.start_time = '';
  }
  return { ...draft, fields: f };
}

function isDraft(value: unknown): value is CreateDraft {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<CreateDraft>;
  return (
    d.v === DRAFT_VERSION &&
    typeof d.savedAt === 'number' &&
    (d.step === 1 || d.step === 2 || d.step === 3) &&
    !!d.fields &&
    typeof d.fields === 'object' &&
    !!d.recurring &&
    Array.isArray(d.photos)
  );
}

/** The user's draft, freshened, or null (none, unreadable, another version, or older than 7 days). */
export function readDraft(storage: Storage | null | undefined, userId: string, now: Date): CreateDraft | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(draftKey(userId));
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDraft(storage, userId);
    return null;
  }
  if (!isDraft(parsed) || now.getTime() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
    clearDraft(storage, userId);
    return null;
  }
  // Only the allow-listed fields come back, whatever an older build wrote.
  const fields = {} as Record<keyof DraftFields, unknown>;
  for (const name of DRAFT_FIELD_NAMES) fields[name] = (parsed.fields as unknown as Record<string, unknown>)[name];
  const draft = freshen({ ...parsed, fields: fields as unknown as DraftFields }, now);
  return hasContent(draft) ? draft : null;
}

/** Saves the draft, or removes the key when the form is blank. */
export function writeDraft(storage: Storage | null | undefined, userId: string, draft: CreateDraft): void {
  if (!storage) return;
  try {
    if (hasContent(draft)) storage.setItem(draftKey(userId), JSON.stringify(draft));
    else storage.removeItem(draftKey(userId));
  } catch {
    // Full or blocked storage: the form still works, it just is not kept.
  }
}

export function clearDraft(storage: Storage | null | undefined, userId: string): void {
  if (!storage) return;
  try {
    storage.removeItem(draftKey(userId));
  } catch {
    // Nothing to do: an unreadable draft is already no draft.
  }
}

/** window.localStorage, or null where reading it throws. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
