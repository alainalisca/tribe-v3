import { describe, it, expect } from 'vitest';
import {
  DRAFT_MAX_AGE_MS,
  clearDraft,
  draftKey,
  readDraft,
  toDraft,
  writeDraft,
  type DraftSource,
} from './createDraft';
import { clampStep, errorsForStep, firstFailingStep, parseStep, resumeStep, stepOfField } from './createSteps';

/** A Storage over a Map, with a switch to make every call throw. */
function memoryStorage() {
  const map = new Map<string, string>();
  let broken = false;
  const guard = () => {
    if (broken) throw new Error('blocked');
  };
  const storage = {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (guard(), map.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void map.set(k, v)),
    removeItem: (k: string) => (guard(), void map.delete(k)),
  } as Storage;
  return { storage, map, breakIt: () => (broken = true) };
}

// 10:00 in Bogotá on Tuesday 21 October 2026.
const NOW = new Date('2026-10-21T15:00:00Z');
const USER = 'user-1';

const source = (patch: Partial<DraftSource['form']> = {}): DraftSource => ({
  form: {
    sport: 'Boxing',
    date: '2026-10-25',
    start_time: '07:00',
    duration: 60,
    location: 'Laureles',
    latitude: 6.24,
    longitude: -75.59,
    description: 'Técnica',
    max_participants: 12,
    join_policy: 'open',
    skill_level: 'all_levels',
    gender_preference: 'all',
    is_test: false,
    // Payment fields the page's form state carries. None may reach storage.
    is_paid: true,
    price_display: '45000',
    currency: 'COP',
    payment_instructions: 'Nequi 300 000 0000',
    ...patch,
  },
  recurring: { is_recurring: false, recurrence_pattern: '', recurrence_end_date: '' },
  step: 2,
  photos: ['https://example.test/p1.jpg'],
  venue: null,
});

describe('a draft never holds a payment field', () => {
  it('drops is_paid, the price, the currency and the instructions, whatever the form holds', () => {
    const { storage, map } = memoryStorage();
    writeDraft(storage, USER, toDraft(source(), NOW));
    const raw = map.get(draftKey(USER)) as string;
    expect(raw).toBeTruthy();
    for (const banned of [
      'is_paid',
      'price_display',
      'price_cents',
      'currency',
      'payment_instructions',
      'Nequi',
      '45000',
    ]) {
      expect(raw).not.toContain(banned);
    }
  });

  it('drops any other field nobody allow-listed', () => {
    const draft = toDraft(source({ equipment: 'Guantes', secret: 'x' }), NOW);
    expect(Object.keys(draft.fields)).not.toContain('equipment');
    expect(JSON.stringify(draft)).not.toContain('secret');
  });
});

describe('save and restore', () => {
  it('reads back what it wrote, per user', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source(), NOW));
    const back = readDraft(storage, USER, NOW);
    expect(back?.fields.sport).toBe('Boxing');
    expect(back?.fields.max_participants).toBe(12);
    expect(back?.step).toBe(2);
    expect(back?.photos).toEqual(['https://example.test/p1.jpg']);
    expect(readDraft(storage, 'someone-else', NOW)).toBeNull();
  });

  it('uses the agreed key', () => {
    expect(draftKey('abc')).toBe('tribe:create-draft:v1:abc');
  });

  it('does not keep a blank form, and removes a draft the host emptied', () => {
    const { storage, map } = memoryStorage();
    const blank = source({ sport: '', date: '', start_time: '', location: '', description: '' });
    writeDraft(storage, USER, toDraft({ ...blank, photos: [] }, NOW));
    expect(map.has(draftKey(USER))).toBe(false);
    writeDraft(storage, USER, toDraft(source(), NOW));
    writeDraft(storage, USER, toDraft({ ...blank, photos: [] }, NOW));
    expect(map.has(draftKey(USER))).toBe(false);
  });

  it('clears on demand (publish, "Empezar de nuevo")', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source(), NOW));
    clearDraft(storage, USER);
    expect(readDraft(storage, USER, NOW)).toBeNull();
  });
});

describe('a stale draft', () => {
  it('is dropped after 7 days, and removed from storage', () => {
    const { storage, map } = memoryStorage();
    writeDraft(storage, USER, toDraft(source(), NOW));
    const later = new Date(NOW.getTime() + DRAFT_MAX_AGE_MS + 60_000);
    expect(readDraft(storage, USER, later)).toBeNull();
    expect(map.has(draftKey(USER))).toBe(false);
  });

  it('is kept at 6 days', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source({ date: '2026-12-01' }), NOW));
    const later = new Date(NOW.getTime() + 6 * 24 * 60 * 60 * 1000);
    expect(readDraft(storage, USER, later)?.fields.sport).toBe('Boxing');
  });

  it('loses a date that has passed, with its time', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source({ date: '2026-10-20', start_time: '07:00' }), NOW));
    const back = readDraft(storage, USER, NOW);
    expect(back?.fields.date).toBe('');
    expect(back?.fields.start_time).toBe('');
    expect(back?.fields.sport).toBe('Boxing');
  });

  it('loses only the time when it is today and the time has passed (Bogotá)', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source({ date: '2026-10-21', start_time: '09:00' }), NOW));
    const back = readDraft(storage, USER, NOW);
    expect(back?.fields.date).toBe('2026-10-21');
    expect(back?.fields.start_time).toBe('');
  });

  it('keeps a time later today', () => {
    const { storage } = memoryStorage();
    writeDraft(storage, USER, toDraft(source({ date: '2026-10-21', start_time: '18:00' }), NOW));
    expect(readDraft(storage, USER, NOW)?.fields.start_time).toBe('18:00');
  });
});

describe('storage that misbehaves', () => {
  it('reads unreadable JSON or another version as no draft, and clears it', () => {
    const { storage, map } = memoryStorage();
    map.set(draftKey(USER), '{not json');
    expect(readDraft(storage, USER, NOW)).toBeNull();
    expect(map.has(draftKey(USER))).toBe(false);
    map.set(draftKey(USER), JSON.stringify({ ...toDraft(source(), NOW), v: 0 }));
    expect(readDraft(storage, USER, NOW)).toBeNull();
  });

  it('never throws when storage is blocked or missing', () => {
    const { storage, breakIt } = memoryStorage();
    breakIt();
    expect(() => writeDraft(storage, USER, toDraft(source(), NOW))).not.toThrow();
    expect(readDraft(storage, USER, NOW)).toBeNull();
    expect(() => clearDraft(storage, USER)).not.toThrow();
    expect(readDraft(null, USER, NOW)).toBeNull();
  });

  it('strips payment fields an older build might have written', () => {
    const { storage, map } = memoryStorage();
    const draft = toDraft(source(), NOW);
    map.set(
      draftKey(USER),
      JSON.stringify({ ...draft, fields: { ...draft.fields, is_paid: true, payment_instructions: 'Nequi' } })
    );
    const back = readDraft(storage, USER, NOW) as unknown as { fields: Record<string, unknown> };
    expect(back.fields).not.toHaveProperty('is_paid');
    expect(back.fields).not.toHaveProperty('payment_instructions');
  });
});

describe('steps', () => {
  it('reads ?paso=', () => {
    expect(parseStep('1')).toBe(1);
    expect(parseStep('2')).toBe(2);
    expect(parseStep('3')).toBe(3);
    expect(parseStep('4')).toBe(1);
    expect(parseStep(null)).toBe(1);
  });

  it('places each field on its step', () => {
    expect(stepOfField('sport')).toBe(1);
    expect(stepOfField('skill_level')).toBe(1);
    expect(stepOfField('date')).toBe(2);
    expect(stepOfField('start_time')).toBe(2);
    expect(stepOfField('location')).toBe(2);
    expect(stepOfField('recurrence')).toBe(2);
    expect(stepOfField('max_participants')).toBe(3);
    expect(stepOfField('gender_preference')).toBe(3);
    expect(stepOfField('join_policy')).toBe(3);
  });

  it('publish lands on the earliest step with something to fix', () => {
    expect(firstFailingStep({ max_participants: 'max_participants_range', start_time: 'start_time_past' }, false)).toBe(
      2
    );
    expect(firstFailingStep({ sport: 'sport_required', location: 'location_required' }, true)).toBe(1);
    expect(firstFailingStep({}, false)).toBeNull();
  });

  it("the paid block's errors go to step 3", () => {
    expect(firstFailingStep({}, true)).toBe(3);
  });

  it('Siguiente only sees its own step', () => {
    const all = {
      sport: 'sport_required',
      location: 'location_required',
      max_participants: 'max_participants_range',
    } as const;
    expect(errorsForStep(all, 1)).toEqual({ sport: 'sport_required' });
    expect(errorsForStep(all, 2)).toEqual({ location: 'location_required' });
    expect(errorsForStep(all, 3)).toEqual({ max_participants: 'max_participants_range' });
  });

  it('a restored draft resumes on its saved step, clamped to 1..3', () => {
    expect(resumeStep(2, {})).toBe(2);
    expect(resumeStep(3, {})).toBe(3);
    expect(resumeStep(9, {})).toBe(3);
    expect(resumeStep(-1, {})).toBe(1);
    expect(resumeStep(undefined, {})).toBe(1);
    expect(clampStep(2.4)).toBe(2);
  });

  it('...or on an earlier step that no longer passes', () => {
    expect(resumeStep(3, { date: 'date_required' })).toBe(2);
    expect(resumeStep(3, { sport: 'sport_required', date: 'date_required' })).toBe(1);
  });

  it('a failure on the saved step itself does not move it', () => {
    expect(resumeStep(2, { start_time: 'start_time_required' })).toBe(2);
    expect(resumeStep(3, { max_participants: 'max_participants_range' })).toBe(3);
  });
});
