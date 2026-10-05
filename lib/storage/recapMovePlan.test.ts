import { describe, it, expect } from 'vitest';
import { planRecapMoves, isRecapFileName } from './recapMovePlan';

const URL_BASE = 'https://abc.supabase.co';
const S = '11111111-1111-1111-1111-111111111111';
const U = '22222222-2222-2222-2222-222222222222';
const legacy = (p: string) => `${URL_BASE}/storage/v1/object/public/session-photos/${p}`;

describe('isRecapFileName', () => {
  it('matches both pre-199 recap name shapes and not listing photos', () => {
    expect(isRecapFileName(`${U}/1727000000000-recap-0.jpg`)).toBe(true);
    expect(isRecapFileName(`${U}/1727000000000-recap-flow.jpg`)).toBe(true);
    expect(isRecapFileName(`${U}/1727000000000-0.jpg`)).toBe(false);
    expect(isRecapFileName(`${U}-recap-dir/1727000000000-0.jpg`)).toBe(false);
  });
});

describe('planRecapMoves', () => {
  it('moves a referenced legacy file to <session>/<uploader>/<same name> in the private bucket', () => {
    const plan = planRecapMoves(
      `${URL_BASE}/`,
      [{ id: 'r1', session_id: S, user_id: U, photo_url: legacy(`${U}/1-recap-0.jpg`) }],
      [`${U}/1-recap-0.jpg`]
    );
    expect(plan.moves).toEqual([
      {
        rowId: 'r1',
        fromPath: `${U}/1-recap-0.jpg`,
        toPath: `${S}/${U}/1-recap-0.jpg`,
        oldUrl: legacy(`${U}/1-recap-0.jpg`),
        newUrl: `${URL_BASE}/storage/v1/object/public/session-recap-photos/${S}/${U}/1-recap-0.jpg`,
      },
    ]);
    expect(plan.orphans).toEqual([]);
  });

  it('lists recap files no row references as orphans, and never a listing photo', () => {
    const plan = planRecapMoves(
      URL_BASE,
      [{ id: 'r1', session_id: S, user_id: U, photo_url: legacy(`${U}/1-recap-0.jpg`) }],
      [`${U}/1-recap-0.jpg`, `${U}/2-recap-1.jpg`, `${U}/3-0.jpg`]
    );
    expect(plan.orphans).toEqual([`${U}/2-recap-1.jpg`]);
  });

  it('drops rows already in the private bucket, so a re-run plans nothing', () => {
    const plan = planRecapMoves(
      URL_BASE,
      [
        {
          id: 'r1',
          session_id: S,
          user_id: U,
          photo_url: `${URL_BASE}/storage/v1/object/public/session-recap-photos/${S}/${U}/a.jpg`,
        },
      ],
      []
    );
    expect(plan.moves).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it('skips, with a reason, a legacy row that has no session or uploader, and does not call its file an orphan', () => {
    const plan = planRecapMoves(
      URL_BASE,
      [{ id: 'r9', session_id: null, user_id: U, photo_url: legacy(`${U}/9-recap-0.jpg`) }],
      [`${U}/9-recap-0.jpg`]
    );
    expect(plan.moves).toEqual([]);
    expect(plan.skipped).toEqual([{ rowId: 'r9', reason: expect.stringContaining('no session_id') }]);
    expect(plan.orphans).toEqual([]);
  });

  it('an old copy of a row ALREADY moved is a leftover, never an orphan (the 2026-10-05 production run)', () => {
    const plan = planRecapMoves(
      URL_BASE,
      [
        {
          id: 'r1',
          session_id: S,
          user_id: U,
          photo_url: `${URL_BASE}/storage/v1/object/public/session-recap-photos/${S}/${U}/1-recap-0.jpg`,
        },
      ],
      [`${U}/1-recap-0.jpg`, `${U}/2-recap-1.jpg`]
    );
    expect(plan.moves).toEqual([]);
    expect(plan.leftovers).toEqual([{ legacyPath: `${U}/1-recap-0.jpg`, privatePath: `${S}/${U}/1-recap-0.jpg` }]);
    expect(plan.orphans).toEqual([`${U}/2-recap-1.jpg`]);
  });

  it('a moved row whose old copy is already gone leaves no leftover', () => {
    const plan = planRecapMoves(
      URL_BASE,
      [
        {
          id: 'r1',
          session_id: S,
          user_id: U,
          photo_url: `${URL_BASE}/storage/v1/object/public/session-recap-photos/${S}/${U}/1-recap-0.jpg`,
        },
      ],
      []
    );
    expect(plan.leftovers).toEqual([]);
  });
});
