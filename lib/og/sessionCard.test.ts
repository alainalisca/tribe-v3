import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn() }));

import {
  HEADLINE_ROOM,
  sessionCardProps,
  sessionCardVersion,
  sessionHeadlinePx,
  splitHeadline,
  type SessionCardRow,
} from './sessionCard';

/** T-JOIN1 Part B: the session share card's words. Only fixed facts. */
const row: SessionCardRow = {
  id: 'f8230509-9aa3-4a79-98e4-afa7b6e695ef',
  title: null,
  sport: 'Boxing',
  date: '2030-10-21',
  start_time: '18:30:00',
  status: 'active',
  location: 'Cra 43A #1-50, El Poblado, Medellín',
  location_lat: 6.2086,
  location_lng: -75.5659,
  photos: [],
  creator_name: 'Salomon Tabares',
  partner_id: null,
  partner_status: null,
};

describe('splitHeadline', () => {
  it('splits "<Deporte> con <Nombre>" after "con"', () => {
    expect(splitHeadline('Boxeo con Salomon Tabares')).toEqual(['Boxeo con', 'Salomon Tabares']);
  });
  it('splits any other title where the lines come out most even', () => {
    expect(splitHeadline('Funcional al amanecer')).toEqual(['Funcional', 'al amanecer']);
  });
  it('puts a one-word title on the second line', () => {
    expect(splitHeadline('HYROX')).toEqual(['', 'HYROX']);
  });
  it('cuts a line too long for the card with an ellipsis', () => {
    const [, second] = splitHeadline('Yoga con Maria Fernanda Restrepo Zuluaga');
    expect(second.length).toBeLessThanOrEqual(16);
    expect(second.endsWith('…')).toBe(true);
  });
});

describe('sessionCardProps', () => {
  it('title fallback, the day and time, the barrio, "Reserva en Tribe", the sport tag', () => {
    const p = sessionCardProps(row, null, null);
    expect(p.line).toEqual(['Boxeo con', 'Salomon Tabares']);
    expect(p.sub[0]).toMatch(/^\w{3} 21 oct · 18:30$/);
    expect(p.sub[1]).toBe('El Poblado');
    expect(p.sub[2]).toBe('Reserva en Tribe');
    expect(p.tag).toBe('Boxeo');
  });

  it('the approved partner gym as the place', () => {
    expect(sessionCardProps({ ...row, partner_status: 'approved' }, 'BullBox', null).sub[1]).toBe('BullBox');
  });

  it('never the street address, never spots or counts', () => {
    const text = JSON.stringify(sessionCardProps(row, null, null));
    expect(text).not.toContain('Cra 43A');
    expect(text).not.toMatch(/cupo|spots|van \d|\d+\/\d+/i);
  });

  it('Medellín when there is neither a partner nor a barrio', () => {
    const p = sessionCardProps({ ...row, location: null, location_lat: null, location_lng: null }, null, null);
    expect(p.sub[1]).toBe('Medellín');
  });

  it('uses the session title when it has one', () => {
    expect(sessionCardProps({ ...row, title: 'Sparring de sábado' }, null, null).line).toEqual([
      'Sparring',
      'de sábado',
    ]);
  });
});

describe('sessionHeadlinePx', () => {
  // Widest measured Big Shoulders 900 capital is 0.46 em; the dot takes 22 px.
  const width = (line: string, px: number, dot = false) => line.length * 0.46 * px + (dot ? 22 : 0);

  it.each([
    ['Boxeo con', 'Salomon Tabares'],
    ['Yoga con', 'Neera Yoga'],
    ['Sesión con', 'Maria Fernanda R…'],
  ])('keeps "%s / %s" and the dot off the photo', (a, b) => {
    const px = sessionHeadlinePx([a, b]);
    expect(width(a, px)).toBeLessThanOrEqual(HEADLINE_ROOM);
    expect(width(b, px, true)).toBeLessThanOrEqual(HEADLINE_ROOM);
  });

  it("never goes above the site cards' 101 px", () => {
    expect(sessionHeadlinePx(['', 'HYROX'])).toBe(101);
  });
});

describe('sessionCardVersion', () => {
  it('changes with what the card shows and not with anything else', () => {
    const v = sessionCardVersion(row, null);
    expect(sessionCardVersion({ ...row, description: 'otra' }, null)).toBe(v);
    expect(sessionCardVersion({ ...row, start_time: '19:00:00' }, null)).not.toBe(v);
    expect(sessionCardVersion(row, 'BullBox')).not.toBe(v);
  });
});
