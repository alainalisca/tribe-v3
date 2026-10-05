import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadRecapPhotoFile, recapPhotoPath } from './recapPhotoUpload';

const S = '11111111-1111-1111-1111-111111111111';
const U = '22222222-2222-2222-2222-222222222222';

function mockStorage(uploadError: { message: string } | null = null) {
  const upload = vi.fn(async () => ({ data: uploadError ? null : { path: 'p' }, error: uploadError }));
  const getPublicUrl = vi.fn((p: string) => ({
    data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/session-recap-photos/${p}` },
  }));
  const from = vi.fn(() => ({ upload, getPublicUrl }));
  return { client: { storage: { from } } as unknown as SupabaseClient, from, upload };
}

describe('recapPhotoPath', () => {
  it('puts the session first and the uploader second: the bucket policies read them in that order', () => {
    const parts = recapPhotoPath(S, U, '0', 'jpg').split('/');
    expect(parts[0]).toBe(S);
    expect(parts[1]).toBe(U);
    expect(parts[2]).toMatch(/^\d+-recap-0\.jpg$/);
    expect(parts).toHaveLength(3);
  });
});

describe('uploadRecapPhotoFile', () => {
  it('uploads to the PRIVATE recap bucket, never the public session-photos bucket', async () => {
    const m = mockStorage();
    const url = await uploadRecapPhotoFile(m.client, {
      sessionId: S,
      userId: U,
      blob: new Blob(['x']),
      fileExt: 'jpg',
      label: 'flow',
    });
    expect(m.from).toHaveBeenCalledWith('session-recap-photos');
    expect(m.from).not.toHaveBeenCalledWith('session-photos');
    const [path, , opts] = m.upload.mock.calls[0] as unknown as [string, Blob, { upsert: boolean }];
    expect(path.startsWith(`${S}/${U}/`)).toBe(true);
    expect(opts.upsert).toBe(false);
    expect(url).toBe(`https://x.supabase.co/storage/v1/object/public/session-recap-photos/${path}`);
  });

  it('throws the Storage error and returns no URL', async () => {
    const m = mockStorage({ message: 'new row violates row-level security policy' });
    await expect(
      uploadRecapPhotoFile(m.client, { sessionId: S, userId: U, blob: new Blob(['x']), fileExt: 'jpg', label: '0' })
    ).rejects.toMatchObject({ message: 'new row violates row-level security policy' });
  });
});
