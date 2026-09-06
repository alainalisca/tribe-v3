import { describe, it, expect } from 'vitest';
import { validateVideoSync, MAX_VIDEO_SECONDS, ACCEPTED_VIDEO_TYPE_PREFIX } from './videoValidation';

/**
 * Uploads go to Cloudflare Stream, which transcodes any common format and
 * bills duration rather than bytes. The MP4 only rule and the 50 MB cap were
 * therefore removed. Duration is the check that still maps to money and it
 * stays at 60 seconds, under the 120 the mint route reserves.
 */

function makeFile(opts: { type?: string; size?: number; name?: string }): File {
  const { type = 'video/mp4', size = 1024, name = 'intro.mp4' } = opts;
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('validateVideoSync', () => {
  it.each(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'VIDEO/MP4'])(
    'accepts %s, because Stream transcodes it',
    (type) => {
      expect(validateVideoSync(makeFile({ type }))).toBeNull();
    }
  );

  it('accepts an iPhone .MOV, which the old MP4 only rule rejected', () => {
    expect(validateVideoSync(makeFile({ type: 'video/quicktime', name: 'IMG_0001.MOV' }))).toBeNull();
  });

  it.each(['image/jpeg', 'application/pdf', 'audio/mpeg', ''])('rejects %p as wrong_type', (type) => {
    expect(validateVideoSync(makeFile({ type }))).toBe('wrong_type');
  });

  it('no longer rejects a large file, since Stream bills duration and not bytes', () => {
    expect(validateVideoSync(makeFile({ type: 'video/mp4', size: 60 * 1024 * 1024 }))).toBeNull();
  });

  it('keeps the duration cap at 60, below the 120 the mint route reserves', () => {
    expect(MAX_VIDEO_SECONDS).toBe(60);
    expect(ACCEPTED_VIDEO_TYPE_PREFIX).toBe('video/');
  });
});

// validateVideoDuration is not unit tested here because it needs a live
// browser media pipeline (HTMLVideoElement.loadedmetadata). The component
// contract is that every File passes through it before upload.
