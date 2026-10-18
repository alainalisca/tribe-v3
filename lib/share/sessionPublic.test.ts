import { describe, it, expect } from 'vitest';
import { cardWhen, hostFirstName, pageWhen, publicSessionPlace, publicSessionTitle } from './sessionPublic';

/** T-JOIN1 Part B: what a signed-out visitor sees of a session, worded once. */
describe('publicSessionTitle', () => {
  it('the title when there is one, else "<Deporte> con <Nombre>"', () => {
    expect(publicSessionTitle({ title: 'Clase abierta', sport: 'Boxing', creatorName: 'Salomon T' }, 'es')).toBe(
      'Clase abierta'
    );
    expect(publicSessionTitle({ title: null, sport: 'Boxing', creatorName: 'Salomon Tabares Adarve' }, 'es')).toBe(
      'Boxeo con Salomon'
    );
    expect(publicSessionTitle({ title: '  ', sport: 'Yoga', creatorName: 'Neera' }, 'en')).toBe('Yoga with Neera');
    expect(publicSessionTitle({ title: null, sport: 'Other', creatorName: 'Leo' }, 'es')).toBe('Sesión con Leo');
  });

  it("the host's first name only, as stored, with a trailing sport word dropped (Al, 2026-10-18)", () => {
    expect(publicSessionTitle({ sport: 'Yoga', creatorName: 'Neera yoga' }, 'es')).toBe('Yoga con Neera');
    expect(publicSessionTitle({ sport: 'Boxing', creatorName: 'Salomón Tabares' }, 'es')).toBe('Boxeo con Salomón');
    expect(publicSessionTitle({ sport: 'Boxing', creatorName: 'Sofía Boxeo' }, 'es')).toBe('Boxeo con Sofía');
    expect(publicSessionTitle({ sport: 'Pilates', creatorName: 'Caroline Vanegas ' }, 'en')).toBe(
      'Pilates with Caroline'
    );
    expect(publicSessionTitle({ sport: 'Yoga', creatorName: null }, 'es')).toBe('Yoga');
  });

  it('never strips the only word, even when it is the sport', () => {
    expect(hostFirstName('Yoga', 'Yoga')).toBe('Yoga');
    expect(hostFirstName('  ', 'Yoga')).toBe('');
  });
});

describe('publicSessionPlace', () => {
  it('the approved partner, with the barrio under it', () => {
    expect(
      publicSessionPlace({
        partnerName: 'CrossFit BullBox',
        partnerApproved: true,
        location: 'Cra 43A #1-50, El Poblado, Medellín',
      })
    ).toEqual({ place: 'CrossFit BullBox', barrio: 'El Poblado' });
  });
  it('no partner: the barrio, never the street address', () => {
    const r = publicSessionPlace({ location: 'Cra 43A #1-50, El Poblado, Medellín' });
    expect(r).toEqual({ place: 'El Poblado', barrio: null });
    expect(JSON.stringify(r)).not.toMatch(/Cra|#|43A/);
  });
  it('a pending partner does not show; only the city means no place', () => {
    expect(publicSessionPlace({ partnerName: 'X Gym', partnerApproved: false, location: 'Medellín' })).toEqual({
      place: null,
      barrio: null,
    });
  });
});

describe('when', () => {
  it('reads the calendar date, never shifted by a time zone', () => {
    expect(cardWhen('2026-10-19', '18:30:00', 'es')).toBe('Lun 19 oct · 18:30');
    expect(cardWhen('2026-10-19', '18:30:00', 'en')).toBe('Mon Oct 19 · 18:30');
    expect(pageWhen('2026-10-19', '06:00', 'es')).toBe('Lunes 19 de octubre, 06:00');
    expect(pageWhen('2026-11-01', null, 'en')).toBe('Sunday, November 1');
  });
});
