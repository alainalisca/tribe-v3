// @vitest-environment node
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T-SHARE1 Part C. A coach's share card: which photo it shows (the spec's
 * order, Tribe storage only, never a rejected image), what it says (no counts,
 * gym or Medellín, "Reserva en Tribe"), and that it renders as a small JPEG
 * for a coach with a storage avatar, an Unsplash avatar, and no sessions.
 */
const BASE = 'https://proj.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
const store = (name: string) => `${BASE}/storage/v1/object/public/profile-images/${name}`;

const db: { coach: Record<string, unknown> | null; sessions: unknown[]; eq: [string, string][] } = {
  coach: null,
  sessions: [],
  eq: [],
};
const uploads: string[] = [];

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          db.eq.push([col, val]);
          return q;
        },
        gte: () => q,
        limit: async () => ({ data: table === 'sessions' ? db.sessions : [], error: null }),
        maybeSingle: async () => ({ data: db.coach, error: null }),
      };
      return q;
    },
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: { message: 'not found' } }),
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
      }),
    },
  }),
}));

import { cardResponse } from '@/lib/og/card';
import {
  chooseCardPhoto,
  coachCardProps,
  coachCardResponse,
  coachCardVersion,
  coachGym,
  coachSports,
  loadCoach,
  type CoachRow,
} from '@/lib/og/coachCard';

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#7a8c99' } })
    .jpeg()
    .toBuffer();

function coach(over: Partial<CoachRow> = {}): CoachRow {
  return {
    id: '34d56f30-f8d2-4588-beaa-07ee53d13d1d',
    name: 'Andrés Varón',
    sports: ['CrossFit', 'Running'],
    avatar_url: null,
    cover_image_url: null,
    photos: [],
    card_photo_url: null,
    card_photo_box: null,
    card_photo_rejects: [],
    handle: 'andres',
    is_instructor: true,
    banned: false,
    deleted_at: null,
    is_test_account: false,
    bio: null,
    instructor_bio: null,
    ...over,
  };
}

/** A fake fetch serving images of given sizes by URL, recording what was asked. */
function images(sizes: Record<string, [number, number]>) {
  const asked: string[] = [];
  const load = async (url: string) => {
    asked.push(url);
    const s = sizes[url];
    return s ? jpeg(s[0], s[1]) : null;
  };
  return { load, asked };
}

beforeEach(() => {
  db.coach = null;
  db.sessions = [];
  db.eq = [];
  uploads.length = 0;
});

describe('which photo the card shows', () => {
  it('(a) the pick, with its box, without downloading anything to choose', async () => {
    const { load, asked } = images({});
    const box = { x0: 0, y0: 0.1, x1: 1, y1: 0.7 };
    const r = await chooseCardPhoto(coach({ card_photo_url: store('pick.jpg'), card_photo_box: box }), load);
    expect(r?.choice).toEqual({ url: store('pick.jpg'), box, rule: 'chosen' });
    expect(asked).toEqual([]);
  });

  it('(b) the best gallery photo: 900 px on the short side, landscape first, then the largest', async () => {
    const { load } = images({
      [store('cover.jpg')]: [1200, 400], // a banner: 400 px short side, too small
      [store('tall.jpg')]: [1440, 2160],
      [store('wide.jpg')]: [2160, 1440],
      [store('huge-tall.jpg')]: [4000, 6000],
    });
    const c = coach({
      cover_image_url: store('cover.jpg'),
      photos: [store('tall.jpg'), store('huge-tall.jpg'), store('wide.jpg')],
    });
    expect((await chooseCardPhoto(c, load))?.choice).toEqual({ url: store('wide.jpg'), box: null, rule: 'gallery' });
  });

  it('(c) the avatar only when it is at least 800 px; (d) otherwise no photo', async () => {
    const big = images({ [store('av.jpg')]: [1024, 1024] });
    expect((await chooseCardPhoto(coach({ avatar_url: store('av.jpg') }), big.load))?.choice.rule).toBe('avatar');
    const small = images({ [store('av.jpg')]: [600, 600] });
    expect(await chooseCardPhoto(coach({ avatar_url: store('av.jpg') }), small.load)).toBeNull();
  });

  it('never a hotlink: an Unsplash avatar or a cover on another site is not even downloaded', async () => {
    const { load, asked } = images({});
    const c = coach({
      avatar_url: 'https://images.unsplash.com/photo-123?w=1600',
      cover_image_url: 'https://www.marceanahata.com/_astro/sobre-mi.webp',
      card_photo_url: 'https://images.unsplash.com/photo-9.jpg',
    });
    expect(await chooseCardPhoto(c, load)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('never a rejected image, at any step, the pick included (Caroline)', async () => {
    const { load } = images({ [store('stock.jpg')]: [3000, 2000], [store('av.jpg')]: [3000, 4500] });
    const c = coach({
      card_photo_url: store('stock.jpg'),
      photos: [store('stock.jpg')],
      avatar_url: store('av.jpg'),
      card_photo_rejects: [store('stock.jpg'), store('av.jpg')],
    });
    expect(await chooseCardPhoto(c, load)).toBeNull();
  });
});

describe('what the card says', () => {
  it('"Entrena con" and the first name as written, sports in Spanish, the gym, "Reserva en Tribe"', () => {
    const p = coachCardProps(coach(), 'CrossFit BullBox', 'data:image/jpeg;base64,AA');
    expect(p).toMatchObject({
      line: ['Entrena con', 'Andrés'],
      sub: ['CrossFit · Correr', 'CrossFit BullBox', 'Reserva en Tribe'],
      tag: 'CrossFit',
      variant: 'coach',
      lang: 'es',
    });
    expect(p.initial).toBeUndefined();
  });

  it('with no gym, Medellín; with no sport, "Entrenador" and the tag "Coach"; with no photo, the initial', () => {
    const p = coachCardProps(coach({ name: 'Alejandro', sports: [] }), null, null);
    expect(p.sub).toEqual(['Entrenador', 'Medellín', 'Reserva en Tribe']);
    expect(p.tag).toBe('Coach');
    expect(p.initial).toBe('A');
    expect(p.photo).toBeUndefined();
  });

  it('never a count or a date: nothing on the card changes week to week', () => {
    for (const p of [coachCardProps(coach(), null, null), coachCardProps(coach(), 'Zona de Combate', 'x')]) {
      expect([...p.line, ...p.sub, p.tag].join(' ')).not.toMatch(/\d/);
    }
  });

  it('keeps the sport line to what fits beside the photo: one sport when two would run long', () => {
    expect(coachSports(['Boxing', 'Muay Thai', 'Kickboxing'])).toEqual(['Boxeo', 'Muay Thai']);
    expect(coachSports(['CrossFit', 'Weightlifting'])).toEqual(['CrossFit']);
    expect(coachSports(['Other', 'Yoga'])).toEqual(['Yoga']);
  });
});

describe('the gym on the card', () => {
  it('is the approved, active partner most sessions are at; pending or paused gyms do not count', async () => {
    db.sessions = [
      { partner_status: 'approved', partner: { business_name: 'CrossFit BullBox', status: 'active' } },
      { partner_status: 'approved', partner: { business_name: 'CrossFit BullBox', status: 'active' } },
      { partner_status: 'pending', partner: { business_name: 'Zona de Combate', status: 'active' } },
      { partner_status: 'pending', partner: { business_name: 'Zona de Combate', status: 'active' } },
      { partner_status: 'pending', partner: { business_name: 'Zona de Combate', status: 'active' } },
      { partner_status: 'approved', partner: { business_name: 'Paused Gym', status: 'paused' } },
    ];
    expect(await coachGym('u1')).toBe('CrossFit BullBox');
    db.sessions = [];
    expect(await coachGym('u1')).toBeNull();
  });
});

describe('one page, two addresses', () => {
  it('looks a coach up by id for a uuid and by handle (lowercased) for anything else', async () => {
    db.coach = coach();
    await loadCoach('34d56f30-f8d2-4588-beaa-07ee53d13d1d');
    await loadCoach('Andres');
    expect(db.eq).toEqual([
      ['id', '34d56f30-f8d2-4588-beaa-07ee53d13d1d'],
      ['handle', 'andres'],
    ]);
  });

  it('changes the card URL fingerprint when the pick moves, and not otherwise', () => {
    const a = coach({ card_photo_url: store('p.jpg'), card_photo_box: { x0: 0, y0: 0, x1: 1, y1: 0.9 } });
    const b = coach({ card_photo_url: store('p.jpg'), card_photo_box: { x0: 0, y0: 0.05, x1: 1, y1: 0.95 } });
    expect(coachCardVersion(a, null)).toBe(coachCardVersion({ ...a }, null));
    expect(coachCardVersion(a, null)).not.toBe(coachCardVersion(b, null));
  });
});

describe('the card renders', () => {
  const MAX = 250 * 1024;

  it('for a coach with a storage avatar: a 1200 x 630 JPEG with their photo, under 250 KB', async () => {
    const av = await jpeg(1024, 1024);
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Uint8Array(av), { headers: { 'Content-Type': 'image/jpeg' } }));
    db.coach = coach({ avatar_url: store('lissete.jpg'), sports: ['Yoga'], name: 'Lissete' });
    const res = await coachCardResponse('lissete');
    spy.mockRestore();
    expect(res?.headers.get('Content-Type')).toBe('image/jpeg');
    const body = Buffer.from(await res!.arrayBuffer());
    expect(body.length).toBeLessThan(MAX);
    expect(await sharp(body).metadata()).toMatchObject({ format: 'jpeg', width: 1200, height: 630 });
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatch(/^card-photos\/34d56f30-f8d2-4588-beaa-07ee53d13d1d-[0-9a-f]{16}\.jpg$/);
  });

  it('for a coach with an Unsplash avatar: the initial card, nothing fetched or stored', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    db.coach = coach({ name: 'Caroline', avatar_url: 'https://images.unsplash.com/photo-1?w=2000' });
    const res = await coachCardResponse('caroline');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(uploads).toEqual([]);
    expect((await sharp(Buffer.from(await res!.arrayBuffer())).metadata()).width).toBe(1200);
  });

  it('for a coach with no sessions this week: the same card, Medellín, no number anywhere', async () => {
    db.sessions = [];
    const p = coachCardProps(coach(), await coachGym('u1'), null);
    expect(p.sub[1]).toBe('Medellín');
    const res = await cardResponse(p);
    expect(Buffer.from(await res.arrayBuffer()).length).toBeLessThan(MAX);
  });

  it('is no card at all for an athlete, a banned or a deleted account', async () => {
    for (const over of [{ is_instructor: false }, { banned: true }, { deleted_at: '2026-10-01' }]) {
      db.coach = coach(over);
      expect(await coachCardResponse('andres')).toBeNull();
    }
    db.coach = null;
    expect(await coachCardResponse('nobody')).toBeNull();
  });
});
