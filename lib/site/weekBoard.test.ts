import { describe, it, expect } from 'vitest';
import {
  buildWeekBoard,
  collapseSeries,
  daysLabel,
  isoWeekday,
  pickBoard,
  publicPlace,
  rowTitle,
  shortName,
  sportCounts,
  type BoardSessionRow,
} from './weekBoard';
import { weekBoardJsonLd } from './weekJsonLd';
import type { WeekRow } from './weekTypes';

/** Friday 2026-10-16, 10:00 in Bogotá; the window runs to Friday 2026-10-23. */
const TODAY = '2026-10-16';
const LAST = '2026-10-23';
const NOW = '10:00';

let n = 0;
function session(over: Partial<BoardSessionRow> & { creatorId?: string; creatorName?: string } = {}): BoardSessionRow {
  n += 1;
  const { creatorId = 'c1', creatorName = 'Andrés Varón', ...rest } = over;
  return {
    id: `s${n}`,
    sport: 'Yoga',
    title: null,
    date: '2026-10-19',
    start_time: '06:00:00',
    duration: 60,
    location: 'Cra 43A #1-50, El Poblado, Medellín',
    max_participants: 10,
    current_participants: 4,
    is_paid: false,
    price_cents: null,
    currency: 'COP',
    status: 'active',
    recurring_parent_id: null,
    partner_status: null,
    partner: null,
    creator: {
      id: creatorId,
      name: creatorName,
      avatar_url: null,
      is_admin: false,
      is_test_account: false,
      banned: false,
      deleted_at: null,
    },
    ...rest,
  };
}

const board = (rows: BoardSessionRow[]) => buildWeekBoard(rows, TODAY, LAST, NOW);

describe('one row per series per WEEK (decision 2)', () => {
  it('collapses Monday to Friday of one series into one row naming its days', () => {
    const parent = session({ id: 'p', date: '2026-10-19' });
    const kids = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((date) =>
      session({ date, recurring_parent_id: 'p' })
    );
    const rows = board([parent, ...kids]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('p');
    expect(rows[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(`${daysLabel(rows[0].weekdays, 'es')} · ${rows[0].startTime}`).toBe('Lun a vie · 06:00');
  });

  it('links to the NEXT occurrence even when the parent is already past', () => {
    // The parent ran last week; this week only children remain.
    const kids = ['2026-10-21', '2026-10-19'].map((date) => session({ date, recurring_parent_id: 'past-parent' }));
    const [row] = board(kids);
    expect(row.date).toBe('2026-10-19');
    expect(row.id).toBe(kids[1].id);
    expect(row.seriesId).toBe('past-parent');
  });

  it('keeps two series of the same coach apart, but the board shows one per coach', () => {
    const series = collapseSeries([session({ id: 'a' }), session({ id: 'b', start_time: '18:30:00' })]);
    expect(series.map((r) => r.id)).toEqual(['a', 'b']);
    expect(board([session({ id: 'a' }), session({ id: 'b', start_time: '18:30:00' })]).map((r) => r.id)).toEqual(['a']);
  });

  it('labels days in both languages', () => {
    expect(daysLabel([1, 2, 3, 4, 5], 'es')).toBe('Lun a vie');
    expect(daysLabel([1, 2, 3, 4, 5], 'en')).toBe('Mon to Fri');
    expect(daysLabel([1, 3, 5], 'es')).toBe('Lun, mié y vie');
    expect(daysLabel([1, 3, 5], 'en')).toBe('Mon, Wed and Fri');
    expect(daysLabel([6, 7], 'es')).toBe('Sáb y dom');
    expect(daysLabel([2], 'es')).toBe('Mar');
    expect(daysLabel([1, 2, 3, 5], 'es')).toBe('Lun a mié y vie');
    expect(daysLabel([], 'es')).toBe('');
  });

  it('reads the weekday of the calendar date, Monday = 1, Sunday = 7', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });
});

describe('eight rows: two per sport, one per coach (T-SITE1.1)', () => {
  const at = (h: number) => `${String(h).padStart(2, '0')}:00:00`;

  it('skips a third row of a sport and fills with the next sports, soonest first', () => {
    const rows = [
      session({ id: 'y1', sport: 'Yoga', creatorId: 'a', start_time: at(6) }),
      session({ id: 'y2', sport: 'Yoga', creatorId: 'b', start_time: at(7) }),
      session({ id: 'y3', sport: 'Yoga', creatorId: 'c', start_time: at(8) }),
      session({ id: 'b1', sport: 'Boxing', creatorId: 'd', start_time: at(9) }),
      session({ id: 'y4', sport: 'Yoga', creatorId: 'e', start_time: at(10) }),
      session({ id: 'r1', sport: 'Running', creatorId: 'f', start_time: at(11) }),
    ];
    expect(board(rows).map((r) => r.id)).toEqual(['y1', 'y2', 'b1', 'r1']);
  });

  it('shows each coach once, even across sports', () => {
    const rows = [
      session({ id: 'a1', sport: 'Yoga', creatorId: 'a', start_time: at(6) }),
      session({ id: 'a2', sport: 'Boxing', creatorId: 'a', start_time: at(7) }),
      session({ id: 'b1', sport: 'Boxing', creatorId: 'b', start_time: at(8) }),
    ];
    expect(board(rows).map((r) => r.id)).toEqual(['a1', 'b1']);
  });

  it('stops at eight', () => {
    const sports = ['Yoga', 'Boxing', 'Running', 'CrossFit', 'Pilates', 'HYROX'];
    const rows = Array.from({ length: 20 }, (_, i) =>
      session({ id: `r${i}`, sport: sports[i % sports.length], creatorId: `c${i}`, start_time: at(6 + (i % 12)) })
    );
    const picked = board(rows);
    expect(picked).toHaveLength(8);
    const perSport = new Map<string, number>();
    for (const r of picked) perSport.set(r.sport, (perSport.get(r.sport) ?? 0) + 1);
    expect(Math.max(...perSport.values())).toBeLessThanOrEqual(2);
    expect(new Set(picked.map((r) => r.creatorId)).size).toBe(8);
  });

  it('returns fewer than eight when the caps run out', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...collapseSeries([session()])[0],
      id: `r${i}`,
      creatorId: `c${i % 3}`,
    }));
    expect(pickBoard(many)).toHaveLength(2);
  });
});

describe('what the board leaves out', () => {
  it('drops staff, test, banned and deleted creators (decision 1; TODO T-TRUST1)', () => {
    const base = session().creator!;
    const rows = [
      session({ id: 'ok' }),
      session({ id: 'admin', creator: { ...base, id: 'x1', is_admin: true } }),
      session({ id: 'test', creator: { ...base, id: 'x2', is_test_account: true } }),
      session({ id: 'banned', creator: { ...base, id: 'x3', banned: true } }),
      session({ id: 'deleted', creator: { ...base, id: 'x4', deleted_at: '2026-10-01T00:00:00Z' } }),
      session({ id: 'orphan', creator: null }),
    ];
    expect(board(rows).map((r) => r.id)).toEqual(['ok']);
  });

  it('drops cancelled sessions, sessions outside the window and sessions that already started today', () => {
    const rows = [
      session({ id: 'cancelled', status: 'cancelled' }),
      session({ id: 'yesterday', date: '2026-10-15' }),
      session({ id: 'too-far', date: '2026-10-24' }),
      session({ id: 'started', date: TODAY, start_time: '09:59:00' }),
      session({ id: 'later-today', date: TODAY, start_time: '18:00:00' }),
    ];
    expect(board(rows).map((r) => r.id)).toEqual(['later-today']);
  });
});

describe('never a street address', () => {
  it('names the verified partner gym when the session is hosted at one', () => {
    const partner = { business_name: 'CrossFit BullBox', status: 'active' };
    expect(publicPlace({ location: 'Cl 10 #43-12', partner_status: 'approved', partner })).toBe('CrossFit BullBox');
  });

  it('ignores a partner that has not approved or is not active', () => {
    const partner = { business_name: 'CrossFit BullBox', status: 'active' };
    expect(publicPlace({ location: 'Cra 43A #1-50, El Poblado', partner_status: 'pending', partner })).toBe(
      'El Poblado'
    );
    expect(
      publicPlace({
        location: 'Cra 43A #1-50, El Poblado',
        partner_status: 'approved',
        partner: { ...partner, status: 'paused' },
      })
    ).toBe('El Poblado');
  });

  it('falls back to the neighbourhood, else no place, and never shows the street', () => {
    expect(publicPlace({ location: 'Cra 43A #1-50, El Poblado, Medellín', partner_status: null, partner: null })).toBe(
      'El Poblado'
    );
    expect(publicPlace({ location: 'Cra 43A #1-50', partner_status: null, partner: null })).toBeNull();
    expect(publicPlace({ location: 'Cra 43A #1-50, Medellín', partner_status: null, partner: null })).toBeNull();
    expect(publicPlace({ location: null, partner_status: null, partner: null })).toBeNull();
  });

  it('JSON-LD still names the city for a row without a place', () => {
    const rows = board([session({ id: 'x', location: 'Cra 43A #1-50' })]);
    expect(rows[0].place).toBeNull();
    const ld = weekBoardJsonLd(rows, 'es', 'https://tribelatam.com') as {
      itemListElement: { item: { location: { name: string } } }[];
    };
    expect(ld.itemListElement[0].item.location.name).toBe('Medellín');
  });

  it('no row of a realistic board carries the street or the raw location', () => {
    const rows = board([session(), session({ id: 'z', location: 'Calle 10 # 40-20 apto 301', creatorId: 'c9' })]);
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toMatch(/Cra|Calle|#|apto/);
      expect(Object.keys(r)).not.toContain('location');
    }
  });
});

describe('sport counts for Deportes', () => {
  it("counts every upcoming occurrence per sport, with the board's own filters", () => {
    const base = session().creator!;
    const counts = sportCounts(
      [
        session({ sport: 'Boxing' }),
        session({ sport: 'Boxing', recurring_parent_id: 'p1' }),
        session({ sport: 'Yoga' }),
        session({ sport: 'Yoga', status: 'cancelled' }),
        session({ sport: 'Yoga', creator: { ...base, id: 'x', is_test_account: true } }),
        session({ sport: 'Running', date: '2026-10-24' }),
      ],
      TODAY,
      LAST,
      NOW
    );
    expect(counts).toEqual({ Boxing: 2, Yoga: 1 });
  });
});

describe('row details', () => {
  it('names the creator as first name and last initial', () => {
    expect(shortName('Andrés Varón')).toBe('Andrés V.');
    expect(shortName('Neera y')).toBe('Neera Y.');
    expect(shortName('Lissete')).toBe('Lissete');
    expect(shortName('  ')).toBe('');
  });

  it('never leaves the title blank: "<Sport> con <First name>" (decision 1)', () => {
    const [row] = board([session({ sport: 'Boxing', title: '  ', creatorName: 'Salomón Tabares' })]);
    expect(rowTitle(row, 'es')).toBe('Boxeo con Salomón');
    expect(rowTitle(row, 'en')).toBe('Boxing with Salomón');
    expect(rowTitle({ ...row, sport: 'Other' }, 'es')).toBe('Clase con Salomón');
    expect(rowTitle({ ...row, title: 'WOD de los viernes' }, 'es')).toBe('WOD de los viernes');
  });

  it('shows spots left only when there are some, and Gratis when free', () => {
    const [full] = board([session({ max_participants: 10, current_participants: 10 })]);
    expect(full.spotsLeft).toBeNull();
    const [open] = board([session({ max_participants: 10, current_participants: 3 })]);
    expect(open.spotsLeft).toBe(7);
    expect(open.price).toBeNull();
    const [paid] = board([session({ is_paid: true, price_cents: 2_500_000, currency: 'cop' })]);
    expect(paid.price).toEqual({ cents: 2_500_000, currency: 'COP' });
  });
});

describe('JSON-LD for the board', () => {
  const rows: WeekRow[] = board([
    session({ id: 'a', title: 'WOD', is_paid: true, price_cents: 2_500_000 }),
    session({ id: 'b', creatorId: 'c2', creatorName: 'Leo Gómez' }),
  ]);

  it('is an ItemList of Events at the public place, with valid dates and URLs', () => {
    const ld = weekBoardJsonLd(rows, 'es', 'https://tribelatam.com/') as {
      '@type': string;
      itemListElement: { position: number; item: Record<string, unknown> }[];
    };
    expect(ld['@type']).toBe('ItemList');
    expect(ld.itemListElement.map((e) => e.position)).toEqual([1, 2]);
    const [first, second] = ld.itemListElement.map((e) => e.item);
    expect(first['@type']).toBe('Event');
    expect(first.startDate).toBe('2026-10-19T06:00:00-05:00');
    expect(first.url).toBe('https://tribelatam.com/s/a/');
    expect(first.location).toEqual({ '@type': 'Place', name: 'El Poblado', address: 'El Poblado' });
    expect(first.offers).toMatchObject({ price: '25000', priceCurrency: 'COP' });
    expect(second.name).toBe('Yoga con Leo');
    expect(JSON.stringify(ld)).not.toMatch(/Cra|#/);
  });

  it('emits nothing for an empty board', () => {
    expect(weekBoardJsonLd([], 'es', 'https://tribelatam.com')).toBeNull();
  });
});
