import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  setCommunityBanner,
  removeStaleBannerFiles,
  communityBannerPath,
  versionedBannerUrl,
  COMMUNITY_BANNER_BUCKET,
} from './communityBanner';
import { COMMUNITY_WRITE_REFUSED } from './communities';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

const CID = '32a1fced-9a46-4ddc-ae43-e31d0b6e8f6e';
const PUBLIC = `https://x.supabase.co/storage/v1/object/public/community-banners/${CID}/banner.jpg`;

interface Opts {
  uploadError?: { message: string } | null;
  rows?: unknown[] | null;
  updateError?: { message: string } | null;
  listed?: Array<{ name: string }> | null;
  listError?: { message: string } | null;
  removeError?: { message: string } | null;
}

/** The storage bucket and the communities table, with the real response shapes. */
function client(o: Opts = {}) {
  const upload = vi
    .fn()
    .mockResolvedValue({ data: o.uploadError ? null : { path: 'p' }, error: o.uploadError ?? null });
  const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: PUBLIC } });
  const list = vi.fn().mockResolvedValue({ data: o.listError ? null : (o.listed ?? []), error: o.listError ?? null });
  const remove = vi.fn().mockResolvedValue({ data: o.removeError ? null : [], error: o.removeError ?? null });
  const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl, list, remove });

  const select = vi
    .fn()
    .mockResolvedValue({ data: o.updateError ? null : (o.rows ?? [{ id: CID }]), error: o.updateError ?? null });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  const supabase = { from, storage: { from: storageFrom } } as unknown as SupabaseClient;
  return { supabase, upload, getPublicUrl, list, remove, storageFrom, update, eq };
}

const IMAGE = new Blob(['x'], { type: 'image/jpeg' });

beforeEach(() => vi.mocked(logError).mockClear());

describe('the banner lives at one fixed path per community', () => {
  it('is <communityId>/banner.jpg, so a new banner replaces the old file instead of adding one', () => {
    expect(communityBannerPath(CID)).toBe(`${CID}/banner.jpg`);
  });

  it('versions the URL so browsers stop showing the previous picture, and never stacks markers', () => {
    expect(versionedBannerUrl(PUBLIC, 111)).toBe(`${PUBLIC}?v=111`);
    expect(versionedBannerUrl(`${PUBLIC}?v=111`, 222)).toBe(`${PUBLIC}?v=222`);
  });
});

describe('setCommunityBanner', () => {
  it('upserts to the fixed path in the community-banners bucket as JPEG', async () => {
    const c = client();
    await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(c.storageFrom).toHaveBeenCalledWith(COMMUNITY_BANNER_BUCKET);
    expect(c.upload).toHaveBeenCalledWith(`${CID}/banner.jpg`, IMAGE, { contentType: 'image/jpeg', upsert: true });
  });

  it('stores the versioned URL on the row and returns it', async () => {
    const c = client();
    const res = await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(res).toEqual({ success: true, data: `${PUBLIC}?v=123` });
    expect(c.update).toHaveBeenCalledWith({ cover_image_url: `${PUBLIC}?v=123` });
    expect(c.eq).toHaveBeenCalledWith('id', CID);
  });

  // Migration 192 refuses the upload for anyone who is not creator or admin.
  // The storage error must reach the caller, and the row must not move.
  it('reports a refused upload and never touches the row', async () => {
    const c = client({ uploadError: { message: 'new row violates row-level security policy' } });
    const res = await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(res).toEqual({ success: false, error: 'new row violates row-level security policy' });
    expect(c.update).not.toHaveBeenCalled();
    expect(c.list).not.toHaveBeenCalled();
  });

  it('reports zero rows back from the row update as refused, not saved', async () => {
    const c = client({ rows: [] });
    const res = await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(res).toEqual({ success: false, error: COMMUNITY_WRITE_REFUSED });
  });

  it('does not clean up the folder when the row update failed', async () => {
    const c = client({ rows: [] });
    await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(c.list).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('removes the old timestamped files after a successful save', async () => {
    const c = client({ listed: [{ name: 'banner.jpg' }, { name: 'banner-1726000000000.jpg' }] });
    const res = await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(res.success).toBe(true);
    expect(c.list).toHaveBeenCalledWith(CID);
    expect(c.remove).toHaveBeenCalledWith([`${CID}/banner-1726000000000.jpg`]);
  });

  it('still succeeds when the cleanup fails, and says so in the log', async () => {
    const c = client({ listed: [{ name: 'banner-1.jpg' }], removeError: { message: 'nope' } });
    const res = await setCommunityBanner(c.supabase, CID, IMAGE, 123);
    expect(res).toEqual({ success: true, data: `${PUBLIC}?v=123` });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'nope' }),
      expect.objectContaining({ action: 'removeStaleBannerFiles.remove' })
    );
  });
});

describe('removeStaleBannerFiles', () => {
  it('never deletes the current banner', async () => {
    const c = client({ listed: [{ name: 'banner.jpg' }] });
    expect(await removeStaleBannerFiles(c.supabase, CID)).toBe(0);
    expect(c.remove).not.toHaveBeenCalled();
  });

  it('only ever deletes inside the community’s own folder', async () => {
    const c = client({ listed: [{ name: 'a.jpg' }, { name: 'b.png' }, { name: 'banner.jpg' }] });
    expect(await removeStaleBannerFiles(c.supabase, CID)).toBe(2);
    const paths = c.remove.mock.calls[0][0] as string[];
    expect(paths).toEqual([`${CID}/a.jpg`, `${CID}/b.png`]);
    expect(paths.every((p) => p.startsWith(`${CID}/`))).toBe(true);
  });

  it('logs a failed listing and removes nothing', async () => {
    const c = client({ listError: { message: 'list failed' } });
    expect(await removeStaleBannerFiles(c.supabase, CID)).toBe(0);
    expect(c.remove).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'list failed' }),
      expect.objectContaining({ action: 'removeStaleBannerFiles.list' })
    );
  });
});
