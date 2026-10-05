/**
 * Every DAL reader of recap photos and stories hands the screen a SIGNED URL
 * (migration 199 made both buckets private). A reader that forgets would not
 * leak anything; it would show a broken image, which is why these assert the
 * output URL rather than that a signer was called.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRecapPhotosForSession, fetchActiveStoriesForSession, fetchAllActiveStories } from './queries';
import { fetchRecapPhotosByCreators } from './sessions';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

const OBJ = 'https://abc.supabase.co/storage/v1/object';
const S = '11111111-1111-1111-1111-111111111111';
const U = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

function mockClient(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gt', 'in', 'order', 'limit']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  const createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `${OBJ}/sign/b/${p}?token=t`, error: null })),
    error: null,
  }));
  const storageFrom = vi.fn(() => ({ createSignedUrls }));
  const client = { from: () => chain, storage: { from: storageFrom } } as unknown as SupabaseClient;
  return { client, storageFrom };
}

const privateRecap = `${OBJ}/public/session-recap-photos/${S}/${U}/1-recap-0.jpg`;
const legacyRecap = `${OBJ}/public/session-photos/${U}/2-recap-0.jpg`;

describe('fetchAllRecapPhotosForSession', () => {
  it('signs private recap URLs and leaves not-yet-moved legacy URLs as they are', async () => {
    const m = mockClient([
      { id: 'a', photo_url: privateRecap, user_id: U },
      { id: 'b', photo_url: legacyRecap, user_id: U },
    ]);
    const res = await fetchAllRecapPhotosForSession(m.client, S);
    expect(res.success).toBe(true);
    expect(res.data?.map((r) => r.photo_url)).toEqual([`${OBJ}/sign/b/${S}/${U}/1-recap-0.jpg?token=t`, legacyRecap]);
    expect(res.data?.[0].id).toBe('a');
    expect(m.storageFrom).toHaveBeenCalledWith('session-recap-photos');
  });
});

describe('fetchRecapPhotosByCreators (Home feed strip)', () => {
  it('returns signed URLs grouped by creator', async () => {
    const m = mockClient([
      { photo_url: privateRecap, session: { creator_id: C } },
      { photo_url: legacyRecap, session: { creator_id: C } },
    ]);
    const res = await fetchRecapPhotosByCreators(m.client, [C]);
    expect(res.data).toEqual({ [C]: [`${OBJ}/sign/b/${S}/${U}/1-recap-0.jpg?token=t`, legacyRecap] });
  });
});

describe('story readers', () => {
  const story = {
    id: 'st',
    session_id: S,
    user_id: U,
    media_url: `${OBJ}/public/session-stories/${S}/${U}/v.mp4`,
    media_type: 'video',
    thumbnail_url: `${OBJ}/public/session-stories/${S}/${U}/v_thumb.jpg`,
    caption: null,
    created_at: '2026-10-04T00:00:00Z',
    user: { name: 'Ana', avatar_url: null },
  };

  it('fetchActiveStoriesForSession signs media and thumbnail', async () => {
    const m = mockClient([story]);
    const res = await fetchActiveStoriesForSession(m.client, S);
    expect(res.data?.[0].media_url).toBe(`${OBJ}/sign/b/${S}/${U}/v.mp4?token=t`);
    expect(res.data?.[0].thumbnail_url).toBe(`${OBJ}/sign/b/${S}/${U}/v_thumb.jpg?token=t`);
    expect(m.storageFrom).toHaveBeenCalledWith('session-stories');
  });

  it('fetchAllActiveStories (Home stories row and /stories) signs media', async () => {
    const m = mockClient([story]);
    const res = await fetchAllActiveStories(m.client);
    expect(res.data?.[0].media_url).toBe(`${OBJ}/sign/b/${S}/${U}/v.mp4?token=t`);
    expect(res.data?.[0].user?.name).toBe('Ana');
  });
});
