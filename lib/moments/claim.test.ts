import { describe, it, expect } from 'vitest';
import { fakeDb } from './testing/fakeDb';
import { claimInvite, inviteStatus, loadInvite, loadInvitePreview, planClaim } from './claim';

/**
 * T-MOM1 Part C, spec tests: the claim flow end to end with a fresh account,
 * the expired token, and "never show other people's photos; only photos the
 * invite is tagged in".
 */
const S1 = '11111111-1111-4111-8111-111111111111';
const HOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FRESH = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TOKEN = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z';
const INV = '99999999-9999-4999-8999-999999999999';
const future = new Date(Date.now() + 10 * 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();

function world(invite: Partial<Record<string, unknown>> = {}) {
  const media = (id: string, taken: string, deleted: string | null = null) => ({
    id,
    session_id: S1,
    storage_path: `${S1}/${id}.jpg`,
    uploader_id: HOST,
    taken_at: taken,
    created_at: taken,
    deleted_at: deleted,
  });
  const tag = (id: string, media_id: string, who: { user_id?: string; invite_id?: string }, o = {}) => ({
    id,
    media_id,
    user_id: who.user_id ?? null,
    invite_id: who.invite_id ?? null,
    delivered_at: '2026-10-10T00:00:00Z',
    removed_at: null,
    ...o,
  });
  return fakeDb({
    media_invites: [
      {
        id: INV,
        session_id: S1,
        display_name: 'Mateo',
        phone: '+573001234567',
        token: TOKEN,
        claimed_by: null,
        claimed_at: null,
        expires_at: future,
        ...invite,
      },
    ],
    sessions: [{ id: S1, title: null, sport: 'Boxing', date: '2026-10-07', photos: ['https://x.supabase.co/p.jpg'], creator_id: HOST }],
    users: [{ id: HOST, name: 'Salomon Tabares' }],
    session_media: [
      media('m1', '2026-10-07T07:20:00Z'),
      media('m2', '2026-10-07T07:05:00Z'),
      media('m3', '2026-10-07T07:30:00Z'), // somebody else's photo
      media('m4', '2026-10-07T07:40:00Z', '2026-10-08T00:00:00Z'), // deleted
    ],
    session_media_tags: [
      tag('t1', 'm1', { invite_id: INV }),
      tag('t2', 'm2', { invite_id: INV }),
      tag('t3', 'm3', { user_id: OTHER }),
      tag('t4', 'm4', { invite_id: INV }),
    ],
  });
}

describe('the claim link (T-MOM1 Part C)', () => {
  it('status: ok, expired, claimed by someone else, mine, unknown', () => {
    const inv = { id: INV, session_id: S1, display_name: 'M', claimed_by: null, expires_at: future };
    expect(inviteStatus(inv, null)).toBe('ok');
    expect(inviteStatus({ ...inv, expires_at: past }, null)).toBe('expired');
    expect(inviteStatus({ ...inv, claimed_by: OTHER }, FRESH)).toBe('claimed');
    expect(inviteStatus({ ...inv, claimed_by: FRESH }, FRESH)).toBe('mine');
    expect(inviteStatus({ ...inv, claimed_by: FRESH }, null)).toBe('claimed');
    expect(inviteStatus(null, null)).toBe('not_found');
  });

  it('a token that is not 32 alphanumerics never reaches the database', async () => {
    const { client } = world();
    expect(await loadInvite(client, '../../etc')).toBeNull();
    expect(await loadInvite(client, TOKEN)).not.toBeNull();
  });

  it("the preview holds only the invite's photos: the first in full, the rest as server-blurred tiles", async () => {
    const { client, signed } = world();
    const preview = await loadInvitePreview(client, (await loadInvite(client, TOKEN))!);
    expect(preview!.count).toBe(2); // m2 and m1; never m3 (someone else's) or m4 (deleted)
    expect(preview!.firstUrl).toBe(`signed:${S1}/m2.jpg.1200.webp`);
    expect(signed).toEqual([`${S1}/m2.jpg.1200.webp`]); // nothing else is ever signed for this page
    expect(preview!.tiles.every((t) => t.startsWith('data:image/webp;base64,'))).toBe(true);
    expect(preview!.coachName).toBe('Salomon Tabares');
  });

  it('end to end with a fresh account: claimed once, its tags move to the account, landing on that session', async () => {
    const { client, db } = world();
    const r = await claimInvite(client, TOKEN, FRESH);
    expect(r).toEqual({ ok: true, sessionId: S1 });
    expect(db.media_invites[0].claimed_by).toBe(FRESH);
    const mine = db.session_media_tags.filter((t) => t.user_id === FRESH).map((t) => t.media_id);
    expect(mine.sort()).toEqual(['m1', 'm2', 'm4']);
    expect(db.session_media_tags.some((t) => t.invite_id === INV)).toBe(false);
    // Somebody else's tag is untouched.
    expect(db.session_media_tags.find((t) => t.id === 't3')!.user_id).toBe(OTHER);
    // The same account coming back is fine; a second account is refused.
    expect(await claimInvite(client, TOKEN, FRESH)).toEqual({ ok: true, sessionId: S1 });
    expect(await claimInvite(client, TOKEN, OTHER)).toEqual({ ok: false, status: 'claimed' });
  });

  it('an expired token claims nothing', async () => {
    const { client, db } = world({ expires_at: past });
    expect(await claimInvite(client, TOKEN, FRESH)).toEqual({ ok: false, status: 'expired' });
    expect(db.media_invites[0].claimed_by).toBeNull();
    expect(db.session_media_tags.filter((t) => t.invite_id === INV)).toHaveLength(3);
  });

  it('a photo the account is already on keeps their own tag (even one they removed), never a second one', () => {
    expect(
      planClaim(
        [
          { id: 't1', media_id: 'm1' },
          { id: 't2', media_id: 'm2' },
        ],
        new Set(['m2'])
      )
    ).toEqual({ move: ['t1'], drop: ['t2'] });
  });
});
