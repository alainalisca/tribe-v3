/**
 * The recurring-sessions cron reads parent rows with an explicit column list
 * instead of select('*').
 *
 * Why this is guarded: migration 137 revoked anon's SELECT on
 * sessions.payment_instructions. select('*') expands to include it, so the
 * cron's read returned 42501 and the whole job 500'd nightly. The wildcard is
 * what converted one locked-down column into a total failure, and it would do
 * so again the next time a column is revoked.
 *
 * RECURRING_PARENT_COLUMNS must stay in step with RecurringParentSession, which
 * createChildSession consumes. If they drift, a field is read as undefined and
 * silently lands on a generated session.
 */

import { describe, it, expect } from 'vitest';
import { RECURRING_PARENT_COLUMNS } from './sessions';

/**
 * Every field createChildSession copies off the parent, plus the three
 * computeRecurrenceDates inputs. Kept as a literal list so a change to either
 * consumer has to be reflected here deliberately.
 */
const REQUIRED_FIELDS = [
  // computeRecurrenceDates (lib/recurrence.ts RecurrenceInput)
  'date',
  'recurrence_pattern',
  'recurrence_end_date',
  // createChildSession copies these onto the child row
  'id',
  'creator_id',
  'currency',
  'description',
  'duration',
  'equipment',
  'gender_preference',
  'is_paid',
  'join_policy',
  'latitude',
  'location',
  'location_lat',
  'location_lng',
  'longitude',
  'max_participants',
  'photos',
  'platform_fee_percent',
  'price_cents',
  'skill_level',
  'sport',
  'start_time',
  'title',
  'visibility',
] as const;

const selected = RECURRING_PARENT_COLUMNS.split(',').map((c) => c.trim());

describe('RECURRING_PARENT_COLUMNS', () => {
  it('is never a wildcard — that is what broke the cron', () => {
    expect(RECURRING_PARENT_COLUMNS).not.toContain('*');
  });

  it('excludes payment_instructions, the column migration 137 revoked from anon', () => {
    expect(selected).not.toContain('payment_instructions');
  });

  it('selects every field the recurrence math and child-creation need', () => {
    const missing = REQUIRED_FIELDS.filter((f) => !selected.includes(f));
    expect(missing, `not selected: ${missing.join(', ')}`).toEqual([]);
  });

  it('selects nothing beyond what those two consumers use', () => {
    const extra = selected.filter((c) => !REQUIRED_FIELDS.includes(c as (typeof REQUIRED_FIELDS)[number]));
    expect(extra, `selected but unused: ${extra.join(', ')}`).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(selected).size).toBe(selected.length);
  });
});
