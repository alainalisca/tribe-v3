import { describe, it, expect } from 'vitest';
import { addDays, relativeDateLabel, planExpiryLabel, bogotaWeekdayName, bogotaDateLabel, bogotaLocalToUtc, utcToBogotaLocal } from './dates';

const WED = '2026-10-07';

describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays(WED, 1)).toBe('2026-10-08');
    expect(addDays(WED, 7)).toBe('2026-10-14');
  });

  it('subtracts days', () => {
    expect(addDays(WED, -1)).toBe('2026-10-06');
    expect(addDays(WED, -7)).toBe('2026-09-30');
  });
});

describe('bogotaWeekdayName', () => {
  it('returns Spanish weekday for Wednesday 2026-10-07', () => {
    expect(bogotaWeekdayName(WED)).toBe('miércoles');
  });

  it('returns correct day for Thursday', () => {
    expect(bogotaWeekdayName('2026-10-08')).toBe('jueves');
  });

  it('returns correct day for Sunday', () => {
    expect(bogotaWeekdayName('2026-10-11')).toBe('domingo');
  });
});

describe('bogotaDateLabel', () => {
  it('formats today header', () => {
    expect(bogotaDateLabel(WED)).toBe('Hoy, miércoles 7 de octubre');
  });
});

describe('relativeDateLabel (today = Wednesday 2026-10-07)', () => {
  it('same day → "hoy"', () => {
    expect(relativeDateLabel(WED, '2026-10-07')).toBe('hoy');
  });

  it('yesterday → "ayer"', () => {
    expect(relativeDateLabel(WED, '2026-10-06')).toBe('ayer');
  });

  it('tomorrow → "mañana"', () => {
    expect(relativeDateLabel(WED, '2026-10-08')).toBe('mañana');
  });

  it('2 days ahead (Friday) → "el viernes"', () => {
    expect(relativeDateLabel(WED, '2026-10-09')).toBe('el viernes');
  });

  it('6 days ahead (Tuesday) → "el martes"', () => {
    expect(relativeDateLabel(WED, '2026-10-13')).toBe('el martes');
  });

  it('2 days back (Monday) → "el lunes pasado"', () => {
    expect(relativeDateLabel(WED, '2026-10-05')).toBe('el lunes pasado');
  });

  it('7 days back (Wednesday) → "el miércoles pasado"', () => {
    expect(relativeDateLabel(WED, '2026-09-30')).toBe('el miércoles pasado');
  });

  it('8+ days back → full date', () => {
    expect(relativeDateLabel(WED, '2026-09-28')).toBe('lunes 28 de septiembre');
  });

  it('7+ days ahead → full date', () => {
    expect(relativeDateLabel(WED, '2026-10-15')).toBe('jueves 15 de octubre');
  });
});

describe('planExpiryLabel (today = Wednesday 2026-10-07)', () => {
  it('expires today → "vence hoy"', () => {
    expect(planExpiryLabel(WED, '2026-10-07')).toBe('vence hoy');
  });

  it('expired yesterday → "venció ayer"', () => {
    expect(planExpiryLabel(WED, '2026-10-06')).toBe('venció ayer');
  });

  it('expires tomorrow → "vence mañana"', () => {
    expect(planExpiryLabel(WED, '2026-10-08')).toBe('vence mañana');
  });

  it('expires Friday → "vence el viernes"', () => {
    expect(planExpiryLabel(WED, '2026-10-09')).toBe('vence el viernes');
  });

  it('expired last Monday → "venció el lunes pasado"', () => {
    expect(planExpiryLabel(WED, '2026-10-05')).toBe('venció el lunes pasado');
  });

  it('expired 8+ days ago → "venció" + full date', () => {
    expect(planExpiryLabel(WED, '2026-09-28')).toBe('venció lunes 28 de septiembre');
  });
});

describe('bogotaLocalToUtc', () => {
  it('converts Bogota wall time to UTC (standard case)', () => {
    expect(bogotaLocalToUtc('2026-10-13T18:00')).toBe('2026-10-13T23:00:00.000Z');
  });

  it('late-night Bogota crosses to next UTC day', () => {
    expect(bogotaLocalToUtc('2026-10-13T23:30')).toBe('2026-10-14T04:30:00.000Z');
  });

  it('midnight Bogota → 05:00 UTC', () => {
    expect(bogotaLocalToUtc('2026-10-14T00:00')).toBe('2026-10-14T05:00:00.000Z');
  });
});

describe('utcToBogotaLocal', () => {
  it('round trip: 2026-10-13T18:00 Bogota → UTC → Bogota', () => {
    const utc = bogotaLocalToUtc('2026-10-13T18:00');
    expect(utc).toBe('2026-10-13T23:00:00.000Z');
    expect(utcToBogotaLocal(utc)).toBe('2026-10-13T18:00');
  });

  it('round trip: late-night 23:30 Bogota', () => {
    const utc = bogotaLocalToUtc('2026-10-13T23:30');
    expect(utcToBogotaLocal(utc)).toBe('2026-10-13T23:30');
  });
});
