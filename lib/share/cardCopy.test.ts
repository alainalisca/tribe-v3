import { describe, expect, it } from 'vitest';
import {
  cardDateLabel,
  cardDateLabelShort,
  cardDateTimeLabel,
  cardHeadline,
  cardPriceLabel,
  cardSpotsLabel,
  cardTimeLabel,
  cardVenueLabel,
  sessionCardDescription,
  sessionCardTitle,
} from './cardCopy';

describe('cardDateLabel', () => {
  it('writes the long Spanish form', () => {
    expect(cardDateLabel('2026-10-12')).toBe('Lunes 12 de octubre');
  });

  // The weekday is computed, not stored, so this is the arm that would catch a
  // UTC/local mix-up: 2026-10-12 is a Monday and 2026-10-11 is a Sunday, so an
  // off-by-one-day bug changes BOTH the number and the word.
  //
  // ⚠ EQUIVALENT MUTANT ON A UTC RUNNER, recorded rather than dropped.
  // Replacing `getUTCDay()` with `getDay()` in cardCopy.ts is caught here on a
  // machine west of UTC and CANNOT be caught on one set to UTC — measured
  // 2026-10-08: in America/Bogota the mutant returns 0 (Domingo) for
  // 2026-10-12 and fails this test; under TZ=UTC it returns 1 and passes.
  // That is not a weakness in these assertions. Under TZ=UTC `getDay` and
  // `getUTCDay` are the same function of the same instant, so NO assertion can
  // separate them. The shipped code is UTC-based and therefore correct in
  // both; what varies is only whether a regression would be detected, and on
  // a UTC CI runner it would not be. Pinning TZ for the suite would fix that
  // and is deliberately not done here — it is a global change for one arm.
  it('gets the weekday right across a boundary', () => {
    expect(cardDateLabel('2026-10-11')).toBe('Domingo 11 de octubre');
    expect(cardDateLabel('2026-10-13')).toBe('Martes 13 de octubre');
  });

  it('accents Miércoles and Sábado', () => {
    expect(cardDateLabel('2026-10-14')).toBe('Miércoles 14 de octubre');
    expect(cardDateLabel('2026-10-17')).toBe('Sábado 17 de octubre');
  });

  it('covers every month name', () => {
    const months = Array.from(
      { length: 12 },
      (_, i) => cardDateLabel(`2026-${String(i + 1).padStart(2, '0')}-15`).split(' de ')[1]
    );
    expect(months).toEqual([
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ]);
  });

  // '' lets the caller DROP the line. A placeholder would print on the card.
  it('returns empty for missing or malformed input', () => {
    expect(cardDateLabel(null)).toBe('');
    expect(cardDateLabel(undefined)).toBe('');
    expect(cardDateLabel('')).toBe('');
    expect(cardDateLabel('not-a-date')).toBe('');
    expect(cardDateLabel('2026-13-01')).toBe('');
  });

  // A timestamp is the shape the DB hands back for some columns; the date part
  // must still parse rather than being rejected wholesale.
  it('accepts a full timestamp and reads only the date part', () => {
    expect(cardDateLabel('2026-10-12T09:00:00Z')).toBe('Lunes 12 de octubre');
  });
});

describe('cardDateLabelShort', () => {
  it('writes the compact Spanish form for og:description', () => {
    expect(cardDateLabelShort('2026-10-12')).toBe('lun 12 oct');
    expect(cardDateLabelShort('2026-03-01')).toBe('dom 1 mar');
  });
});

describe('cardTimeLabel', () => {
  it('writes 12-hour Spanish time without the CLDR inner space', () => {
    expect(cardTimeLabel('09:00:00')).toBe('9:00 a.m.');
    expect(cardTimeLabel('18:30')).toBe('6:30 p.m.');
  });

  // Noon and midnight are where a naive `h % 12` prints "0:00".
  it('handles noon and midnight', () => {
    expect(cardTimeLabel('00:15')).toBe('12:15 a.m.');
    expect(cardTimeLabel('12:00')).toBe('12:00 p.m.');
    expect(cardTimeLabel('12:45')).toBe('12:45 p.m.');
    expect(cardTimeLabel('23:59')).toBe('11:59 p.m.');
  });

  it('returns empty for missing or malformed input', () => {
    expect(cardTimeLabel(null)).toBe('');
    expect(cardTimeLabel('')).toBe('');
    expect(cardTimeLabel('banana')).toBe('');
    expect(cardTimeLabel('25:00')).toBe('');
  });
});

describe('cardDateTimeLabel', () => {
  it('joins with a middot', () => {
    expect(cardDateTimeLabel('2026-10-12', '09:00:00')).toBe('Lunes 12 de octubre · 9:00 a.m.');
  });

  // The separator must not survive a missing half -- a card reading
  // "Lunes 12 de octubre · " is the tell that the join was unconditional.
  it('drops the separator when either half is absent', () => {
    expect(cardDateTimeLabel('2026-10-12', null)).toBe('Lunes 12 de octubre');
    expect(cardDateTimeLabel(null, '09:00:00')).toBe('9:00 a.m.');
    expect(cardDateTimeLabel(null, null)).toBe('');
  });
});

describe('cardPriceLabel', () => {
  // The defect this function exists for: `(cents/100).toLocaleString()` with no
  // locale reads the RUNTIME's locale, and the OG route runs server-side where
  // that is en-US -- so a Colombian price rendered as "50,000". Dots, not
  // commas, and this is the arm that pins it.
  it('groups Colombian pesos with dots and no centavos', () => {
    expect(cardPriceLabel(5_000_000, 'COP')).toBe('$50.000 COP');
    expect(cardPriceLabel(5_000_000, 'COP')).not.toContain(',');
    expect(cardPriceLabel(150_000_000, 'COP')).toBe('$1.500.000 COP');
    expect(cardPriceLabel(100_000, 'COP')).toBe('$1.000 COP');
    expect(cardPriceLabel(99_900, 'COP')).toBe('$999 COP');
  });

  it('defaults to COP when no currency is given', () => {
    expect(cardPriceLabel(5_000_000)).toBe('$50.000 COP');
    expect(cardPriceLabel(5_000_000, null)).toBe('$50.000 COP');
  });

  it('says Gratis rather than $0', () => {
    expect(cardPriceLabel(0, 'COP')).toBe('Gratis');
    expect(cardPriceLabel(null)).toBe('Gratis');
    expect(cardPriceLabel(undefined)).toBe('Gratis');
    expect(cardPriceLabel(-1)).toBe('Gratis');
  });

  it('keeps commas and centavos for USD', () => {
    expect(cardPriceLabel(5_000, 'USD')).toBe('$50.00 USD');
    expect(cardPriceLabel(123_456, 'usd')).toBe('$1,234.56 USD');
  });
});

describe('cardSpotsLabel', () => {
  it('counts what is LEFT, not the capacity', () => {
    expect(cardSpotsLabel(25, 5)).toBe('20 cupos disponibles');
  });

  it('uses the singular for one', () => {
    expect(cardSpotsLabel(10, 9)).toBe('1 cupo disponible');
  });

  it('says agotados at or past capacity', () => {
    expect(cardSpotsLabel(10, 10)).toBe('Cupos agotados');
    expect(cardSpotsLabel(10, 12)).toBe('Cupos agotados');
  });

  // An uncapped session must print NOTHING, not "0 cupos" -- which reads as
  // full, the exact opposite of the truth.
  it('returns empty when there is no capacity set', () => {
    expect(cardSpotsLabel(null, 3)).toBe('');
    expect(cardSpotsLabel(0, 0)).toBe('');
    expect(cardSpotsLabel(undefined, undefined)).toBe('');
  });

  it('treats a null participant count as zero taken', () => {
    expect(cardSpotsLabel(25, null)).toBe('25 cupos disponibles');
  });
});

describe('cardHeadline', () => {
  it('prefers the title', () => {
    expect(cardHeadline({ title: 'Entrenamiento funcional', sport: 'CrossFit' })).toBe('Entrenamiento funcional');
  });

  it('falls back to the sport when the title is absent or blank', () => {
    expect(cardHeadline({ title: null, sport: 'HYROX' })).toBe('HYROX');
    expect(cardHeadline({ title: '   ', sport: 'HYROX' })).toBe('HYROX');
  });

  // THE HYROX HYROX CASE. The duplication came from passing title AND sport as
  // separate card params; this returns ONE string, so there is nothing to draw
  // twice. The assertion is that the word appears exactly once.
  it('yields the word once when the title IS the sport', () => {
    const out = cardHeadline({ title: 'HYROX', sport: 'HYROX' });
    expect(out).toBe('HYROX');
    expect(out.match(/HYROX/g)).toHaveLength(1);
  });

  it('never leaks the enum underscore spelling', () => {
    expect(cardHeadline({ title: null, sport: 'martial_arts' })).toBe('martial arts');
  });

  it('returns empty when it has nothing', () => {
    expect(cardHeadline({ title: null, sport: null })).toBe('');
  });
});

describe('cardVenueLabel', () => {
  // ONE location token, never two. The live HYROX session's venue is
  // "CrossFit BullBox Ciudad del Río" and its detected neighborhood is
  // "El Poblado" -- joining them printed three place names for one place, and
  // string equality cannot see that they overlap.
  it('prefers the venue the host typed and does not append the neighborhood', () => {
    expect(cardVenueLabel('CrossFit BullBox Ciudad del Río', 'El Poblado')).toBe('CrossFit BullBox Ciudad del Río');
    expect(cardVenueLabel('CrossFit BullBox Ciudad del Río', 'El Poblado')).not.toContain('El Poblado');
  });

  it('falls back to the neighborhood when there is no venue', () => {
    expect(cardVenueLabel(null, 'El Poblado')).toBe('El Poblado');
    expect(cardVenueLabel('  ', 'El Poblado')).toBe('El Poblado');
  });

  it('returns empty when it has neither', () => {
    expect(cardVenueLabel(null, null)).toBe('');
  });
});

describe('sessionCardTitle', () => {
  it('reads as the example in the ticket', () => {
    expect(sessionCardTitle({ title: 'HYROX', sport: 'HYROX', instructorName: 'Leo Garcia' })).toBe(
      'HYROX con Leo Garcia'
    );
  });

  it('drops the coach clause when there is no coach', () => {
    expect(sessionCardTitle({ title: 'HYROX', sport: 'HYROX', instructorName: null })).toBe('HYROX');
  });

  it('never renders an empty headline', () => {
    expect(sessionCardTitle({ title: null, sport: null, instructorName: null })).toBe('Entrenamiento');
  });
});

describe('sessionCardDescription', () => {
  const full = {
    title: 'HYROX',
    sport: 'HYROX',
    date: '2026-10-12',
    startTime: '09:00:00',
    priceCents: 5_000_000,
    currency: 'COP',
    instructorName: 'Leo Garcia',
    venue: 'CrossFit BullBox',
    neighborhood: 'El Poblado',
  };

  it('reads as the example in the ticket', () => {
    expect(sessionCardDescription(full)).toBe('HYROX con Leo Garcia · CrossFit BullBox · lun 12 oct · $50.000 COP');
  });

  // The point of the whole module, asserted on the assembled string.
  it('never repeats a word', () => {
    const words = sessionCardDescription(full).split(/\s+·\s+|\s+/);
    const meaningful = words.filter((w) => w.length > 3 && w !== 'con');
    expect(new Set(meaningful).size).toBe(meaningful.length);
  });

  it('stays inside the 160-character preview budget', () => {
    const long = sessionCardDescription({
      ...full,
      title: 'Entrenamiento funcional de alta intensidad para atletas intermedios y avanzados en el valle de Aburrá',
      instructorName: 'Leonardo Alejandro García Restrepo',
      venue: 'Centro de Acondicionamiento Físico CrossFit BullBox Ciudad del Río',
    });
    expect(long.length).toBeLessThanOrEqual(160);
  });

  it('says Gratis for a free session', () => {
    expect(sessionCardDescription({ ...full, priceCents: 0 })).toContain('Gratis');
  });

  it('drops absent parts without leaving dangling separators', () => {
    const sparse = sessionCardDescription({ title: 'HYROX', sport: null, date: null, priceCents: 0 });
    expect(sparse).toBe('HYROX · Gratis');
    expect(sparse).not.toMatch(/·\s*$/);
    expect(sparse).not.toContain('··');
  });
});
