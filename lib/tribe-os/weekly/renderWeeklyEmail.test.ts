import { describe, it, expect } from 'vitest';
import { renderWeeklyEmail, type WeeklyEmailData } from './renderWeeklyEmail';

const SAMPLE_DATA: WeeklyEmailData = {
  week: { monday: '2026-10-05', sunday: '2026-10-11' },
  currency: 'COP',
  numbers: {
    visits: 120,
    visits_pct: 15,
    active_members: 45,
    new_members: 3,
    touches: 8,
    came_back: 2,
    recovered_cents: 15000000,
    at_risk_cents: 30000000,
  },
  came_back_members: [
    { name: 'Carlos Lopez', channel: 'whatsapp', days: 3, monthlyValueCents: 12000000 },
  ],
  expiring_plans: [
    { name: 'Ana Ruiz', plan: 'Mensual', planEndsOn: '2026-10-14', monthlyValueCents: 8000000 },
  ],
  classes: {
    fullest: { className: 'CrossFit', visits: 25, day: '2026-10-07', hour: 18 },
    emptiest: { className: 'Yoga', visits: 4, day: '2026-10-09', hour: 7 },
  },
};

describe('renderWeeklyEmail', () => {
  it('produces valid HTML with no em dashes', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Tribe.OS');
    expect(html).not.toContain('—');
    expect(html).not.toContain('—');
  });

  it('includes the week label', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Semana del 5 al 11 de oct');
  });

  it('includes numbers', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('120');
    expect(html).toContain('+15%');
    expect(html).toContain('45');
  });

  it('includes came back members', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Carlos Lopez');
    expect(html).toContain('WhatsApp');
  });

  it('includes expiring plans', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Ana Ruiz');
    expect(html).toContain('Mensual');
  });

  it('includes class info', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('CrossFit');
    expect(html).toContain('Yoga');
  });

  it('renders empty states gracefully', () => {
    const empty: WeeklyEmailData = {
      ...SAMPLE_DATA,
      came_back_members: [],
      expiring_plans: [],
      classes: { fullest: null, emptiest: null },
    };
    const html = renderWeeklyEmail(empty, 'es');
    expect(html).toContain('Ninguno esta semana');
    expect(html).toContain('Sin datos');
    expect(html).not.toContain('—');
  });

  it('renders English variant', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'en');
    expect(html).toContain('Week of Oct 5 to 11');
    expect(html).not.toContain('—');
  });
});
