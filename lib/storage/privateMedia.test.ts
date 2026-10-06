import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  storagePathFromUrl,
  signStorageUrls,
  signStoryMedia,
  signRecapPhotoUrls,
  SIGNED_URL_TTL_SECONDS,
  STORIES_BUCKET,
  RECAP_PHOTOS_BUCKET,
} from './privateMedia';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

const BASE = 'https://abc.supabase.co/storage/v1/object';
const S = '11111111-1111-1111-1111-111111111111';
const U = '22222222-2222-2222-2222-222222222222';

type SignedItem = { path: string | null; signedUrl: string; error: string | null };

function mockSupabase(result: { data: SignedItem[] | null; error: { message: string } | null }) {
  const createSignedUrls = vi.fn(async () => result);
  const from = vi.fn(() => ({ createSignedUrls }));
  return { client: { storage: { from } } as unknown as SupabaseClient, from, createSignedUrls };
}

/** Signs every requested path as <path>?token=t, like Storage does. */
function echoSigner() {
  const createSignedUrls = vi.fn(async (paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `${BASE}/sign/x/${p}?token=t`, error: null })),
    error: null,
  }));
  const from = vi.fn(() => ({ createSignedUrls }));
  return { client: { storage: { from } } as unknown as SupabaseClient, from, createSignedUrls };
}

beforeEach(() => vi.mocked(logError).mockClear());

describe('storagePathFromUrl', () => {
  it('reads the path from a public URL', () => {
    expect(storagePathFromUrl(`${BASE}/public/session-stories/${S}/${U}/1.jpg`, STORIES_BUCKET)).toBe(
      `${S}/${U}/1.jpg`
    );
  });

  it('reads the path from a SIGNED URL, ignoring its token (the viewer holds these since 199)', () => {
    expect(storagePathFromUrl(`${BASE}/sign/session-stories/${S}/${U}/1.jpg?token=abc.def`, STORIES_BUCKET)).toBe(
      `${S}/${U}/1.jpg`
    );
  });

  it('reads the path from an authenticated URL', () => {
    expect(storagePathFromUrl(`${BASE}/authenticated/session-stories/${S}/a.jpg`, STORIES_BUCKET)).toBe(`${S}/a.jpg`);
  });

  it('decodes percent-encoding', () => {
    expect(storagePathFromUrl(`${BASE}/public/session-stories/${S}/my%20photo.jpg`, STORIES_BUCKET)).toBe(
      `${S}/my photo.jpg`
    );
  });

  it('returns null for another bucket, even one whose name contains this one', () => {
    expect(storagePathFromUrl(`${BASE}/public/session-photos/${U}/1-recap-0.jpg`, RECAP_PHOTOS_BUCKET)).toBeNull();
    expect(storagePathFromUrl(`${BASE}/public/xsession-stories/${S}/a.jpg`, STORIES_BUCKET)).toBeNull();
  });

  it('returns null for null, empty, non-URLs and non-Storage URLs', () => {
    expect(storagePathFromUrl(null, STORIES_BUCKET)).toBeNull();
    expect(storagePathFromUrl('', STORIES_BUCKET)).toBeNull();
    expect(storagePathFromUrl('not a url', STORIES_BUCKET)).toBeNull();
    expect(storagePathFromUrl('https://images.unsplash.com/session-stories/a.jpg', STORIES_BUCKET)).toBeNull();
  });
});

describe('signStorageUrls', () => {
  it('signs only URLs in the bucket, once per path, with the one-hour TTL', async () => {
    const m = echoSigner();
    const inBucket = `${BASE}/public/session-recap-photos/${S}/${U}/a.jpg`;
    const legacy = `${BASE}/public/session-photos/${U}/1-recap-0.jpg`;
    const out = await signStorageUrls(m.client, RECAP_PHOTOS_BUCKET, [inBucket, legacy, inBucket, null]);

    expect(m.from).toHaveBeenCalledWith(RECAP_PHOTOS_BUCKET);
    expect(m.createSignedUrls).toHaveBeenCalledWith([`${S}/${U}/a.jpg`], SIGNED_URL_TTL_SECONDS);
    expect(SIGNED_URL_TTL_SECONDS).toBe(3600);
    expect(out.get(inBucket)).toBe(`${BASE}/sign/x/${S}/${U}/a.jpg?token=t`);
    expect(out.has(legacy)).toBe(false);
  });

  it('makes no request when nothing is in the bucket', async () => {
    const m = echoSigner();
    const out = await signStorageUrls(m.client, STORIES_BUCKET, [`${BASE}/public/session-photos/a/b.jpg`]);
    expect(m.createSignedUrls).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });

  it('leaves out a path Storage refused (the viewer may not read it)', async () => {
    const url = `${BASE}/public/session-stories/${S}/${U}/a.jpg`;
    const m = mockSupabase({
      data: [
        {
          path: `${S}/${U}/a.jpg`,
          signedUrl: '',
          error: 'Either the object does not exist or you do not have access to it',
        },
      ],
      error: null,
    });
    const out = await signStorageUrls(m.client, STORIES_BUCKET, [url]);
    expect(out.has(url)).toBe(false);
  });

  it('recognises a failed request: logs it with the reason and returns nothing signed', async () => {
    const url = `${BASE}/public/session-stories/${S}/${U}/a.jpg`;
    const m = mockSupabase({ data: null, error: { message: 'boom' } });
    const out = await signStorageUrls(m.client, STORIES_BUCKET, [url]);
    expect(out.size).toBe(0);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({ action: 'signStorageUrls', bucket: STORIES_BUCKET })
    );
  });
});

describe('signStoryMedia', () => {
  it('replaces media and thumbnail URLs with signed ones and keeps everything else', async () => {
    const m = echoSigner();
    const story = {
      id: 's1',
      caption: 'hi',
      media_url: `${BASE}/public/session-stories/${S}/${U}/v.mp4`,
      thumbnail_url: `${BASE}/public/session-stories/${S}/${U}/v_thumb.jpg`,
    };
    const [out] = await signStoryMedia(m.client, [story]);
    expect(m.from).toHaveBeenCalledWith(STORIES_BUCKET);
    expect(out.media_url).toBe(`${BASE}/sign/x/${S}/${U}/v.mp4?token=t`);
    expect(out.thumbnail_url).toBe(`${BASE}/sign/x/${S}/${U}/v_thumb.jpg?token=t`);
    expect(out.caption).toBe('hi');
  });

  it('keeps a null thumbnail null', async () => {
    const m = echoSigner();
    const [out] = await signStoryMedia(m.client, [
      { media_url: `${BASE}/public/session-stories/${S}/${U}/a.jpg`, thumbnail_url: null },
    ]);
    expect(out.thumbnail_url).toBeNull();
  });
});

describe('signRecapPhotoUrls', () => {
  it('signs against the private recap bucket', async () => {
    const m = echoSigner();
    await signRecapPhotoUrls(m.client, [`${BASE}/public/session-recap-photos/${S}/${U}/a.jpg`]);
    expect(m.from).toHaveBeenCalledWith('session-recap-photos');
  });
});
