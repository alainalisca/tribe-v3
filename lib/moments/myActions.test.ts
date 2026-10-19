import { describe, it, expect, vi, beforeEach } from 'vitest';

const notified = vi.hoisted(() => ({ calls: [] as Array<{ kind: string; uploaderId: string }> }));
vi.mock('./notify', () => ({
  notifyUploader: async (_s: unknown, a: { kind: string; uploaderId: string }) => {
    notified.calls.push({ kind: a.kind, uploaderId: a.uploaderId });
  },
}));

import { fakeDb } from './testing/fakeDb';
import { downloadUrl, loadMyTag, removeMeFromPhoto, shouldNotifyThanks, thankForPhoto } from './myActions';

/**
 * T-MOM1 Part C: the viewer's actions. Each starts from the person's own
 * delivered tag. "Gracias" tells the uploader once per batch; "Quitarme" tells
 * nobody; "Pedir que la borren" removes them and asks the uploader, once.
 */
const S1 = '11111111-1111-4111-8111-111111111111';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HOST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CREW = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function world() {
  const media = (id: string, uploader: string, deleted: string | null = null) => ({
    id,
    session_id: S1,
    storage_path: `${S1}/${id}.jpg`,
    uploader_id: uploader,
    deleted_at: deleted,
  });
  const tag = (media_id: string, o: Record<string, unknown> = {}) => ({
    id: `t-${media_id}`,
    media_id,
    user_id: ANA,
    invite_id: null,
    delivered_at: '2026-10-10T00:00:00Z',
    removed_at: null,
    thanked_at: null,
    show_on_coach_page: false,
    ...o,
  });
  return fakeDb({
    sessions: [{ id: S1, title: null, sport: 'Boxing', date: '2026-10-07' }],
    users: [{ id: ANA, name: 'Ana Restrepo' }],
    session_media: [media('m1', HOST), media('m2', HOST), media('m3', CREW), media('m4', HOST, '2026-10-11')],
    session_media_tags: [
      tag('m1'),
      tag('m2'),
      tag('m3'),
      tag('m4'),
      tag('m5', { delivered_at: null }),
    ],
    rate_limits: [],
  });
}

beforeEach(() => {
  notified.calls = [];
});

describe('the viewer actions (T-MOM1 Part C)', () => {
  it('only her own delivered, live tag opens an action', async () => {
    const { client } = world();
    expect(await loadMyTag(client, ANA, 'm1')).not.toBeNull();
    expect(await loadMyTag(client, ANA, 'm4')).toBeNull(); // photo deleted
    expect(await loadMyTag(client, ANA, 'm5')).toBeNull(); // not delivered
    expect(await loadMyTag(client, HOST, 'm1')).toBeNull(); // not his tag
  });

  it('Descargar signs the original, as a download', async () => {
    const { client } = world();
    expect(await downloadUrl(client, (await loadMyTag(client, ANA, 'm1'))!)).toBe(`signed:${S1}/m1.jpg:download`);
  });

  it('Gracias: the uploader hears once per batch, and each uploader is their own batch', async () => {
    const { client, db } = world();
    expect((await thankForPhoto(client, ANA, (await loadMyTag(client, ANA, 'm1'))!)).notified).toBe(true);
    expect((await thankForPhoto(client, ANA, (await loadMyTag(client, ANA, 'm2'))!)).notified).toBe(false);
    expect((await thankForPhoto(client, ANA, (await loadMyTag(client, ANA, 'm3'))!)).notified).toBe(true);
    expect(notified.calls).toEqual([
      { kind: 'thanks', uploaderId: HOST },
      { kind: 'thanks', uploaderId: CREW },
    ]);
    expect(db.session_media_tags.filter((t) => t.thanked_at).map((t) => t.media_id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('never thanks yourself for your own photo', () => {
    expect(shouldNotifyThanks({ alreadyThankedInBatch: 0, uploaderId: ANA, userId: ANA })).toBe(false);
  });

  it('Quitarme de esta foto: removed, off the coach page, and the uploader is not told', async () => {
    const { client, db } = world();
    const r = await removeMeFromPhoto(client, ANA, (await loadMyTag(client, ANA, 'm1'))!, false);
    expect(r).toEqual({ removed: true, requested: false });
    const t = db.session_media_tags.find((x) => x.media_id === 'm1')!;
    expect(t.removed_at).toBeTruthy();
    expect(t.show_on_coach_page).toBe(false);
    expect(notified.calls).toEqual([]);
    expect(await loadMyTag(client, ANA, 'm1')).toBeNull();
  });

  it('Pedir que la borren: removed too, and the uploader is asked once', async () => {
    const { client } = world();
    const tag = (await loadMyTag(client, ANA, 'm2'))!;
    expect(await removeMeFromPhoto(client, ANA, tag, true)).toEqual({ removed: true, requested: true });
    expect(await removeMeFromPhoto(client, ANA, tag, true)).toEqual({ removed: true, requested: false });
    expect(notified.calls).toEqual([{ kind: 'delete_request', uploaderId: HOST }]);
  });
});
