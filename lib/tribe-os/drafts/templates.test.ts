import { describe, it, expect } from 'vitest';
import { selectCase, pickVariant, renderDraft, cycleVariant, type DraftContext } from './templates';

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

  it('picks came_back when cameBack is true', () => {
    expect(selectCase(ctx({ cameBack: true, reasons: ['14 días sin venir / 14 days absent'] }))).toBe('came_back');
  });

  it('plan_expired beats came_back', () => {
    expect(
      selectCase(
        ctx({
          cameBack: true,
          reasons: ['Su plan venció hace 5 días / Plan expired 5 days ago'],
        })
      )
    ).toBe('plan_expired');
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
      selectCase(
        ctx({
          daysSinceLastActivity: 7,
          reasons: ['Nuevo y lleva 7 días sin venir / New and 7 days absent'],
        })
      )
    ).toBe('new_not_coming');
  });

  it('falls back to generic', () => {
    expect(selectCase(ctx({ reasons: ['Asistencia estable / Stable attendance'] }))).toBe('generic');
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
  it('substitutes {name} and {days} in plan_expired template', () => {
    const d = renderDraft(
      ctx({
        reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'],
        daysSinceLastActivity: 22,
      }),
      0
    );
    expect(d.case).toBe('plan_expired');
    expect(d.text).toContain('Natalia');
    expect(d.text).not.toContain('{name}');
    expect(d.text.length).toBeLessThanOrEqual(300);
  });

  it('fills {days} for absent case', () => {
    const d = renderDraft(
      ctx({
        reasons: ['20 días sin venir / 20 days absent'],
        daysSinceLastActivity: 20,
      }),
      0
    );
    expect(d.case).toBe('absent');
    expect(d.text).toContain('20');
    expect(d.text).toContain('Natalia');
  });

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

  it('uses first name only', () => {
    const d = renderDraft(ctx({ memberName: 'María José Fernández' }), 0);
    expect(d.text).toContain('María');
    expect(d.text).not.toContain('Fernández');
  });

  it('handles null name gracefully', () => {
    const d = renderDraft(ctx({ memberName: null }), 0);
    expect(d.text).toContain('Hola ');
    expect(d.text).not.toContain('{name}');
  });

  it('all templates are under 300 characters', () => {
    const cases = [
      ctx({ reasons: ['Su plan venció hace 8 días / Plan expired 8 days ago'], daysSinceLastActivity: 30 }),
      ctx({ reasons: ['Su plan vence en 3 días / Plan expires in 3 days'] }),
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
          expect(d.text.length).toBeLessThanOrEqual(300);
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
