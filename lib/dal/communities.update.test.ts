import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  updateCommunity,
  updateCommunityCoverImage,
  COMMUNITY_EDITABLE_COLUMNS,
  COMMUNITY_WRITE_REFUSED,
} from './communities';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

/** from('communities').update(payload).eq('id', x).select('id') */
function clientReturning(result: { data: unknown; error: unknown }) {
  const select = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from } as unknown as SupabaseClient, from, update, eq, select };
}

describe('updateCommunity sends only the columns the edit page owns', () => {
  it('drops every key that is not a named editable column', async () => {
    const { client, update, eq } = clientReturning({ data: [{ id: 'c-1' }], error: null });
    const hostile = {
      name: 'Runners Laureles',
      creator_id: 'someone-else',
      member_count: 999,
      deleted_at: '2026-09-23T00:00:00Z',
      cover_image_url: 'https://example.invalid/x.jpg',
    } as unknown as Parameters<typeof updateCommunity>[2];

    const res = await updateCommunity(client, 'c-1', hostile);

    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ name: 'Runners Laureles' });
    expect(eq).toHaveBeenCalledWith('id', 'c-1');
  });

  it('sends explicit nulls, because clearing a field is a real edit', async () => {
    const { client, update } = clientReturning({ data: [{ id: 'c-1' }], error: null });
    await updateCommunity(client, 'c-1', { description: null, location_lat: null, location_lng: null });
    expect(update).toHaveBeenCalledWith({ description: null, location_lat: null, location_lng: null });
  });

  it('makes no request at all for an empty patch', async () => {
    const { client, from } = clientReturning({ data: [], error: null });
    const res = await updateCommunity(client, 'c-1', {});
    expect(res).toEqual({ success: true });
    expect(from).not.toHaveBeenCalled();
  });

  it('refuses a blank name before it reaches the database', async () => {
    const { client, from } = clientReturning({ data: [{ id: 'c-1' }], error: null });
    const res = await updateCommunity(client, 'c-1', { name: '   ' });
    expect(res.success).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  // RLS refusing an UPDATE is a 200 with zero rows, not an error.
  it('reports zero rows back as refused, never as saved', async () => {
    const { client } = clientReturning({ data: [], error: null });
    const res = await updateCommunity(client, 'c-1', { name: 'x' });
    expect(res).toEqual({ success: false, error: COMMUNITY_WRITE_REFUSED });
  });

  it('surfaces a transport error', async () => {
    const { client } = clientReturning({ data: null, error: { message: 'permission denied for table communities' } });
    const res = await updateCommunity(client, 'c-1', { name: 'x' });
    expect(res).toEqual({ success: false, error: 'permission denied for table communities' });
  });

  // Migration 190 grants authenticated UPDATE on these seven plus
  // cover_image_url, and nothing else. If this list grows, the grant must grow
  // in a new migration first, or every save fails with 42501.
  it('the editable list is exactly the seven columns migration 190 grants for editing', () => {
    expect([...COMMUNITY_EDITABLE_COLUMNS].sort()).toEqual(
      ['description', 'is_private', 'location_lat', 'location_lng', 'location_name', 'name', 'sport'].sort()
    );
  });
});

describe('updateCommunityCoverImage', () => {
  // The moderator bug: RLS refused, PostgREST said 200, the UI said "Banner updated".
  it('reports zero rows back as refused', async () => {
    const { client } = clientReturning({ data: [], error: null });
    const res = await updateCommunityCoverImage(client, 'c-1', 'https://example.invalid/b.jpg');
    expect(res).toEqual({ success: false, error: COMMUNITY_WRITE_REFUSED });
  });

  it('succeeds when the row comes back', async () => {
    const { client, update } = clientReturning({ data: [{ id: 'c-1' }], error: null });
    const res = await updateCommunityCoverImage(client, 'c-1', 'https://example.invalid/b.jpg');
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ cover_image_url: 'https://example.invalid/b.jpg' });
  });
});
