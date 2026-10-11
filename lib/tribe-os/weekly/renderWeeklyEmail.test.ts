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
    { name: 'Ana Ruiz', plan: 'Mensual', planEndsOn: '2026-10-14', expiryLabel: 'vence el miércoles', expiryLabelEn: 'expires Oct 14', monthlyValueCents: 8000000 },
  ],
  to_contact: [
    { name: 'Diego Mora', daysSinceLastActivity: 12, plan: 'Trimestral' },
    { name: 'Laura Perez', daysSinceLastActivity: 8, plan: 'Mensual' },
  ],
  classes: {
    fullest: { className: 'CrossFit', visits: 25, weekday: 2, hour: 18, weekdayName: '' },
    emptiest: { className: 'Yoga', visits: 4, weekday: 4, hour: 7, weekdayName: '' },
  },
};

describe('renderWeeklyEmail', () => {
  it('produces valid HTML with no em dashes', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Tribe.OS');
    expect(html).not.toContain('—');
    expect(html).not.toContain('&mdash;');
  });

  it('includes the week label', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Semana del 5 al 11 de oct');
  });

  it('includes numbers with correct money format', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('120');
    expect(html).toContain('+15%');
    expect(html).toContain('45');
    expect(html).toContain('COP');
  });

  it('includes came back members with "días" not "d"', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Carlos Lopez');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('3 días');
    expect(html).not.toMatch(/3d[^i]/);
  });

  it('pluralizes singular: 1 día / 1 day', () => {
    const data = { ...SAMPLE_DATA, came_back_members: [{ name: 'X', channel: 'whatsapp', days: 1, monthlyValueCents: null }] };
    const esHtml = renderWeeklyEmail(data, 'es');
    expect(esHtml).toContain('1 día');
    expect(esHtml).not.toContain('1 días');
    const enHtml = renderWeeklyEmail(data, 'en');
    expect(enHtml).toContain('1 day');
    expect(enHtml).not.toContain('1 days');
  });

  it('includes expiring plans with human-readable label', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Ana Ruiz');
    expect(html).toContain('Mensual');
    expect(html).toContain('vence el miércoles');
  });

  it('includes contact section', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Para contactar esta semana');
    expect(html).toContain('Diego Mora');
    expect(html).toContain('12 días');
    expect(html).toContain('Trimestral');
    expect(html).toContain('Laura Perez');
  });

  it('includes class info with slot format', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('CrossFit');
    expect(html).toContain('Yoga');
    expect(html).toContain('visitas');
  });

  it('includes Abrir Tribe.OS button', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Abrir Tribe.OS');
    expect(html).toContain('/os/retention');
  });

  it('has correct footer text', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    const footer = html.split('background:#F9FAFB')[1] ?? '';
    expect(footer).toContain('Tribe.OS');
    expect(footer).not.toContain('A+ Fitness');
  });

  it('uses accented characters correctly', () => {
    const html = renderWeeklyEmail(SAMPLE_DATA, 'es');
    expect(html).toContain('Números de la semana');
    expect(html).toContain('Más llena');
    expect(html).toContain('Más vacía');
  });

  it('renders empty states gracefully', () => {
    const empty: WeeklyEmailData = {
      ...SAMPLE_DATA,
      came_back_members: [],
      expiring_plans: [],
      to_contact: [],
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
    expect(html).toContain('Open Tribe.OS');
    expect(html).toContain('3 days');
    expect(html).not.toContain('—');
  });
});
