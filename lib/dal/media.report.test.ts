/**
 * Migration 200: a recap photo report goes through report_recap_photo, which
 * writes only the three report columns. The client never sends an UPDATE, and
 * never names the reporter (the database takes it from the session).
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateRecapPhotoReport } from './media';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function client(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  const from = vi.fn();
  return { c: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe('updateRecapPhotoReport', () => {
  it('calls report_recap_photo with the photo and the reason, and nothing else', async () => {
    const m = client({ data: { success: true }, error: null });
    expect(await updateRecapPhotoReport(m.c, 'photo-1', 'No es de esta sesión')).toEqual({ success: true });
    expect(m.rpc).toHaveBeenCalledWith('report_recap_photo', {
      p_photo_id: 'photo-1',
      p_reason: 'No es de esta sesión',
    });
    expect(m.from).not.toHaveBeenCalled();
  });

  it('a photo the caller cannot see is a failure (not_found), not a silent success', async () => {
    const m = client({ data: { success: false, error: 'not_found' }, error: null });
    expect(await updateRecapPhotoReport(m.c, 'photo-1', 'x')).toEqual({ success: false, error: 'not_found' });
  });

  it('a transport error is a failure carrying its message', async () => {
    const m = client({ data: null, error: { message: 'permission denied for function report_recap_photo' } });
    expect(await updateRecapPhotoReport(m.c, 'photo-1', 'x')).toEqual({
      success: false,
      error: 'permission denied for function report_recap_photo',
    });
  });
});
