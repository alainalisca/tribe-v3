import { describe, it, expect } from 'vitest';
import {
  selectCase,
  pickVariant,
  renderDraft,
  cycleVariant,
  compoundFirstName,
  COMPOUND_FIRST_NAMES,
  type DraftContext,
} from './templates';

function ctx(overrides: Partial<DraftContext> = {}): DraftContext {
  return {
    memberId: 'test-client-001',
    memberName: 'Natalia Gómez',
    phone: '+57 300 123 4567',
    reasons: [],
    daysSinceLastActivity: null,
    lastActivityAt: null,
    lastTouchCreatedAt: null,
    language: 'es',
    ...overrides,
  };
}

describe('selectCase', () => {
  it('picks plan_expired when reason includes "plan venció"', () => {
    expect(selectCase(ctx({ reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'] }))).toBe('plan_expired');
  });

  it('picks plan_expiring when reason includes "plan vence"', () => {
    expect(selectCase(ctx({ reasons: ['Su plan vence en 3 días / Plan expires in 3 days'] }))).toBe('plan_expiring');
  });

  it('picks came_back_expired when cameBack + expired', () => {
    expect(selectCase(ctx({ cameBack: true, reasons: ['Su plan venció hace 5 días / Plan expired 5 days ago'] }))).toBe(
      'came_back_expired'
    );
  });

  it('picks came_back_active when cameBack without expired', () => {
    expect(selectCase(ctx({ cameBack: true, reasons: ['14 días sin venir / 14 days absent'] }))).toBe(
      'came_back_active'
    );
  });

  it('picks absent when days >= 14', () => {
    expect(selectCase(ctx({ daysSinceLastActivity: 20, reasons: ['20 días sin venir / 20 days absent'] }))).toBe(
      'absent'
    );
  });

  it('picks visiting_less when reason matches', () => {
    expect(
      selectCase(
        ctx({
          daysSinceLastActivity: 5,
          reasons: ['Viene 60% menos que su promedio / Visiting 60% less than average'],
        })
      )
    ).toBe('visiting_less');
  });

  it('picks new_not_coming for new members absent 5+ days', () => {
    expect(
      selectCase(ctx({ daysSinceLastActivity: 7, reasons: ['Nuevo y lleva 7 días sin venir / New and 7 days absent'] }))
    ).toBe('new_not_coming');
  });

  it('falls back to generic', () => {
    expect(selectCase(ctx({ reasons: ['Asistencia estable / Stable attendance'] }))).toBe('generic');
  });
});

describe('compoundFirstName', () => {
  it('returns both words for compound names', () => {
    expect(compoundFirstName('Juan Esteban Giraldo')).toBe('Juan Esteban');
    expect(compoundFirstName('María José Fernández')).toBe('María José');
    expect(compoundFirstName('Ana María López')).toBe('Ana María');
    expect(compoundFirstName('Miguel Ángel Rodríguez')).toBe('Miguel Ángel');
  });

  it('returns first word for non-compound names', () => {
    expect(compoundFirstName('Natalia Gómez')).toBe('Natalia');
    expect(compoundFirstName('Carlos Restrepo')).toBe('Carlos');
  });

  it('handles null and empty', () => {
    expect(compoundFirstName(null)).toBe('');
    expect(compoundFirstName('')).toBe('');
  });

  it('handles compound name with no surname', () => {
    expect(compoundFirstName('Juan Esteban')).toBe('Juan Esteban');
  });

  it('COMPOUND_FIRST_NAMES is exported and non-empty', () => {
    expect(Array.isArray(COMPOUND_FIRST_NAMES)).toBe(true);
    expect(COMPOUND_FIRST_NAMES.length).toBeGreaterThan(20);
  });
});

describe('pickVariant', () => {
  it('returns 0, 1, or 2', () => {
    for (const id of ['a', 'b', 'c', 'test-id-123', 'MIRA-0001']) {
      const v = pickVariant(id);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
  });

  it('is deterministic for the same ID', () => {
    expect(pickVariant('MIRA-0001')).toBe(pickVariant('MIRA-0001'));
  });
});

describe('renderDraft', () => {
  it('never includes digit-based day counts in output', () => {
    const cases = [
      ctx({ reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'], daysSinceLastActivity: 22 }),
      ctx({ reasons: ['20 días sin venir / 20 days absent'], daysSinceLastActivity: 20 }),
      ctx({ cameBack: true }),
      ctx(),
    ];
    for (const c of cases) {
      for (const v of [0, 1, 2]) {
        const d = renderDraft({ ...c, language: 'es' }, v);
        expect(d.text).not.toMatch(/\d+\s*días/);
      }
    }
  });

  it('every message ends with a question mark', () => {
    const cases = [
      ctx({ reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'], daysSinceLastActivity: 22 }),
      ctx({ reasons: ['Su plan vence en 3 días / Plan expires in 3 days'], planEndsOn: '2026-10-09' }),
      ctx({ cameBack: true, reasons: ['Su plan venció hace 5 días / Plan expired 5 days ago'] }),
      ctx({ cameBack: true }),
      ctx({ reasons: ['20 días sin venir / 20 days absent'], daysSinceLastActivity: 20 }),
      ctx({ reasons: ['Viene 50% menos que su promedio / Visiting 50% less than average'], daysSinceLastActivity: 5 }),
      ctx({ reasons: ['Nuevo y lleva 7 días sin venir / New and 7 days absent'], daysSinceLastActivity: 7 }),
      ctx(),
    ];
    for (const c of cases) {
      for (const v of [0, 1, 2]) {
        for (const lang of ['es', 'en'] as const) {
          const d = renderDraft({ ...c, language: lang }, v);
          expect(d.text.trimEnd()).toMatch(/\?$/);
        }
      }
    }
  });

  it('came_back splits: expired vs active', () => {
    const expired = renderDraft(
      ctx({ cameBack: true, reasons: ['Su plan venció hace 5 días / Plan expired 5 days ago'] }),
      0
    );
    expect(expired.case).toBe('came_back_expired');

    const active = renderDraft(ctx({ cameBack: true }), 0);
    expect(active.case).toBe('came_back_active');
  });

  // ── Coach self-reference ──────────────────────────────────

  it('uses "me preguntaba" when coach matches logged-in user', () => {
    const d = renderDraft(
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
        coachName: 'Coach Leo',
        loggedInCoachName: 'Leo García',
      }),
      0
    );
    expect(d.text).toContain('me preguntaba');
    expect(d.text).not.toContain('Leo');
  });

  it('uses coach name (stripped prefix) when not self', () => {
    const d = renderDraft(
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
        coachName: 'Coach Ricardo',
        loggedInCoachName: 'Leo García',
      }),
      0
    );
    expect(d.text).toContain('Ricardo preguntó');
    expect(d.text).not.toContain('Coach Ricardo');
  });

  it('strips "Profe " prefix from coach name', () => {
    const d = renderDraft(
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
        coachName: 'Profe Mafe',
      }),
      0
    );
    expect(d.text).toContain('Mafe preguntó');
    expect(d.text).not.toContain('Profe');
  });

  it('self-match ignores accents', () => {
    const d = renderDraft(
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
        coachName: 'Coach María',
        loggedInCoachName: 'Maria García',
      }),
      0
    );
    expect(d.text).toContain('me preguntaba');
  });

  it('falls back cleanly without coach name', () => {
    const d = renderDraft(ctx({ reasons: ['20 días sin venir / 20 days absent'], daysSinceLastActivity: 20 }), 0);
    expect(d.text).not.toContain('preguntó');
    expect(d.text).not.toContain('preguntaba');
    expect(d.text).toMatch(/\?$/);
  });

  // ── Compound first names ──────────────────────────────────

  it('uses compound first name "Juan Esteban"', () => {
    const d = renderDraft(ctx({ memberName: 'Juan Esteban Giraldo' }), 0);
    expect(d.text).toContain('Juan Esteban');
    expect(d.text).not.toContain('Giraldo');
  });

  it('uses compound first name "María José"', () => {
    const d = renderDraft(ctx({ memberName: 'María José Fernández' }), 0);
    expect(d.text).toContain('María José');
    expect(d.text).not.toContain('Fernández');
  });

  it('uses single first name for non-compound', () => {
    const d = renderDraft(ctx({ memberName: 'Valentina Restrepo' }), 0);
    expect(d.text).toContain('Valentina');
    expect(d.text).not.toContain('Restrepo');
  });

  it('handles null name gracefully', () => {
    const d = renderDraft(ctx({ memberName: null }), 0);
    expect(d.text).toContain('Hola ');
    expect(d.text).not.toContain('{name}');
  });

  // ── Class reference with time ─────────────────────────────

  it('uses "la de las {h}" when classStartTime is provided', () => {
    const d = renderDraft(
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 22,
        classStartTime: '2026-10-04T11:00:00Z', // 6 AM Bogota (UTC-5)
      }),
      0
    );
    expect(d.text).toContain('la de las 6');
  });

  it('uses "la de la 1" for 1 PM/AM (singular article)', () => {
    const d = renderDraft(
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 22,
        classStartTime: '2026-10-04T18:00:00Z', // 1 PM Bogota
      }),
      0
    );
    expect(d.text).toContain('la de la 1');
  });

  it('uses "en {className}" when no classStartTime', () => {
    const d = renderDraft(
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 22,
        className: 'CrossFit',
      }),
      0
    );
    expect(d.text).toContain('en CrossFit');
    expect(d.text).not.toContain('en la de CrossFit');
  });

  it('falls back cleanly without class data', () => {
    const d = renderDraft(
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 22,
      }),
      0
    );
    expect(d.text).not.toContain('{classRef}');
    expect(d.text).toMatch(/\?$/);
  });

  // ── Other ─────────────────────────────────────────────────

  it('renders English when language is en', () => {
    const d = renderDraft(
      ctx({
        language: 'en',
        reasons: ['Su plan venció hace 3 días / Plan expired 3 days ago'],
        daysSinceLastActivity: 18,
      }),
      0
    );
    expect(d.text).toMatch(/Hey Natalia/);
  });

  it('plan_expiring shows weekday from planEndsOn', () => {
    const d = renderDraft(
      ctx({ reasons: ['Su plan vence en 3 días / Plan expires in 3 days'], planEndsOn: '2026-10-09' }),
      0
    );
    expect(d.text).toContain('jueves');
  });

  it('all templates are under 280 characters', () => {
    const cases = [
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 30,
        classStartTime: '2026-10-04T11:00:00Z',
      }),
      ctx({ reasons: ['Su plan vence en 3 días / Plan expires in 3 days'], planEndsOn: '2026-10-09' }),
      ctx({ cameBack: true, reasons: ['Su plan venció hace 5 días / Plan expired 5 days ago'] }),
      ctx({
        cameBack: true,
        lastActivityAt: '2026-10-04T10:00:00Z',
        classStartTime: '2026-10-04T11:00:00Z',
      }),
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
        coachName: 'Ricardo Vélez',
        classStartTime: '2026-09-16T11:00:00Z',
        lastActivityAt: '2026-09-16T10:00:00Z',
      }),
      ctx({
        reasons: ['Viene 50% menos que su promedio / Visiting 50% less than average'],
        daysSinceLastActivity: 5,
      }),
      ctx({ reasons: ['Nuevo y lleva 7 días sin venir / New and 7 days absent'], daysSinceLastActivity: 7 }),
      ctx(),
    ];
    for (const c of cases) {
      for (const v of [0, 1, 2]) {
        for (const lang of ['es', 'en'] as const) {
          const d = renderDraft({ ...c, language: lang }, v);
          expect(d.text.length).toBeLessThanOrEqual(280);
        }
      }
    }
  });
});

describe('cycleVariant', () => {
  it('cycles 0 → 1 → 2 → 0', () => {
    expect(cycleVariant(0)).toBe(1);
    expect(cycleVariant(1)).toBe(2);
    expect(cycleVariant(2)).toBe(0);
  });
});
