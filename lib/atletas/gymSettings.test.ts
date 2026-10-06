/**
 * T-AV26: the settings route's validation, an allowlist.
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - return `{ ...b, ...text, ... }` (spread the body) -> "never forwards partner_id or is_active"
 *   - drop the `v > f.max` check -> "numbers outside the table's CHECK ranges are refused"
 *   - settingsFromProgram: omit conversion_bonus_cop -> "fills every key, so a save blanks nothing"
 */
import { describe, it, expect } from 'vitest';
import { DATE_FIELDS, NUMBER_FIELDS, TEXT_FIELDS, parseProgramSettings, settingsFromProgram } from './gymSettings';

const VALID = {
  welcome_offer_en: 'First month 20% off.',
  welcome_offer_es: 'Primer mes con 20% de descuento.',
  showup_reward_en: 'Unlimited classes',
  showup_reward_es: 'Clases ilimitadas',
  class_access_en: 'Open box',
  class_access_es: 'Box abierto',
  conversion_bonus_note_en: 'Paid monthly',
  conversion_bonus_note_es: 'Se paga cada mes',
  conversion_bonus_cop: 50000,
  retention_days: 30,
  promote_at_showups: 10,
  max_athletes: 5,
  pilot_starts_on: '2026-09-15',
  pilot_ends_on: '2026-10-27',
};

describe('parseProgramSettings', () => {
  it('accepts a full valid body', () => {
    const r = parseProgramSettings(VALID);
    expect(r).toEqual({ ok: true, value: VALID });
  });

  it('never forwards partner_id or is_active', () => {
    const r = parseProgramSettings({ ...VALID, partner_id: 'other', is_active: true, created_at: 'x' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.value).sort()).toEqual(
      [...TEXT_FIELDS, ...NUMBER_FIELDS.map((f) => f.key), ...DATE_FIELDS].sort()
    );
    expect(r.value).not.toHaveProperty('partner_id');
    expect(r.value).not.toHaveProperty('is_active');
  });

  it('empty text and an empty bonus are NULL; text is trimmed', () => {
    const r = parseProgramSettings({
      ...VALID,
      welcome_offer_en: '   ',
      conversion_bonus_cop: '',
      class_access_es: ' x ',
    });
    expect(r.ok && r.value.welcome_offer_en).toBeNull();
    expect(r.ok && r.value.conversion_bonus_cop).toBeNull();
    expect(r.ok && r.value.class_access_es).toBe('x');
  });

  it('numbers outside the table CHECK ranges are refused, naming the field', () => {
    expect(parseProgramSettings({ ...VALID, retention_days: 6 })).toEqual({ ok: false, field: 'retention_days' });
    expect(parseProgramSettings({ ...VALID, retention_days: 181 })).toEqual({ ok: false, field: 'retention_days' });
    expect(parseProgramSettings({ ...VALID, promote_at_showups: 0 })).toEqual({
      ok: false,
      field: 'promote_at_showups',
    });
    expect(parseProgramSettings({ ...VALID, max_athletes: 51 })).toEqual({ ok: false, field: 'max_athletes' });
    expect(parseProgramSettings({ ...VALID, conversion_bonus_cop: 5_000_001 })).toEqual({
      ok: false,
      field: 'conversion_bonus_cop',
    });
    expect(parseProgramSettings({ ...VALID, conversion_bonus_cop: -1 })).toEqual({
      ok: false,
      field: 'conversion_bonus_cop',
    });
  });

  it('required numbers cannot be empty, fractional or strings', () => {
    expect(parseProgramSettings({ ...VALID, retention_days: '' })).toEqual({ ok: false, field: 'retention_days' });
    expect(parseProgramSettings({ ...VALID, max_athletes: 2.5 })).toEqual({ ok: false, field: 'max_athletes' });
    expect(parseProgramSettings({ ...VALID, promote_at_showups: '10' })).toEqual({
      ok: false,
      field: 'promote_at_showups',
    });
  });

  it('text over 500 characters or of the wrong type is refused', () => {
    expect(parseProgramSettings({ ...VALID, welcome_offer_es: 'a'.repeat(501) })).toEqual({
      ok: false,
      field: 'welcome_offer_es',
    });
    expect(parseProgramSettings({ ...VALID, showup_reward_en: 5 })).toEqual({ ok: false, field: 'showup_reward_en' });
  });

  it('dates must be real calendar dates, and the pilot cannot end before it starts', () => {
    expect(parseProgramSettings({ ...VALID, pilot_starts_on: '2026-02-30' })).toEqual({
      ok: false,
      field: 'pilot_starts_on',
    });
    expect(parseProgramSettings({ ...VALID, pilot_ends_on: '2026-09-01' })).toEqual({
      ok: false,
      field: 'pilot_ends_on',
    });
    const r = parseProgramSettings({ ...VALID, pilot_starts_on: '', pilot_ends_on: null });
    expect(r.ok && r.value.pilot_starts_on).toBeNull();
    expect(r.ok && r.value.pilot_ends_on).toBeNull();
  });

  it('a missing body or an array is refused', () => {
    expect(parseProgramSettings(null)).toEqual({ ok: false, field: 'body' });
    expect(parseProgramSettings([])).toEqual({ ok: false, field: 'body' });
  });
});

describe('settingsFromProgram', () => {
  it('fills every key, so a save blanks nothing the form did not show', () => {
    // A program row as the summary returns it: more keys than the form edits.
    const row = { ...VALID, partner_id: 'p', is_active: true };
    expect(settingsFromProgram(row)).toEqual(VALID);
  });
});
