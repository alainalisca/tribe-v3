import { describe, it, expect } from 'vitest';
import {
  validateVideoSync,
  isSlowUpload,
  toMegabytes,
  MAX_VIDEO_SECONDS,
  ACCEPTED_VIDEO_TYPE_PREFIX,
  CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES,
  SLOW_UPLOAD_WARNING_BYTES,
} from './videoValidation';

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

  it('accepts a file under the transport ceiling', () => {
    expect(validateVideoSync(makeFile({ type: 'video/mp4', size: 60 * 1024 * 1024 }))).toBeNull();
  });

  it('accepts a file exactly at the ceiling', () => {
    expect(validateVideoSync(makeFile({ size: CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES }))).toBeNull();
  });

  it('rejects a file one byte over the ceiling, before any mint is wasted', () => {
    expect(validateVideoSync(makeFile({ size: CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES + 1 }))).toBe('too_large');
  });

  it('rejects a 4K clip that is short enough on duration but too big to transport', () => {
    // A 45 second 4K HDR iPhone clip runs well past 200 MB. Duration alone
    // would have let this through into an opaque Cloudflare 4xx.
    expect(validateVideoSync(makeFile({ type: 'video/quicktime', size: 260 * 1024 * 1024 }))).toBe('too_large');
  });

  it('checks type before size, so a huge non video reports the useful error', () => {
    expect(validateVideoSync(makeFile({ type: 'image/jpeg', size: 300 * 1024 * 1024 }))).toBe('wrong_type');
  });

  it('keeps the duration cap at 60, below the 120 the mint route reserves', () => {
    expect(MAX_VIDEO_SECONDS).toBe(60);
    expect(ACCEPTED_VIDEO_TYPE_PREFIX).toBe('video/');
  });

  it('stays under Cloudflare 200 MB simple POST ceiling, with headroom', () => {
    expect(CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES).toBe(180 * 1024 * 1024);
    expect(CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES).toBeLessThan(200 * 1024 * 1024);
  });
});

describe('isSlowUpload', () => {
  it('is quiet for a small file', () => {
    expect(isSlowUpload(makeFile({ size: 10 * 1024 * 1024 }))).toBe(false);
  });

  it('warns above the threshold but below the ceiling', () => {
    expect(isSlowUpload(makeFile({ size: SLOW_UPLOAD_WARNING_BYTES + 1 }))).toBe(true);
    expect(isSlowUpload(makeFile({ size: 120 * 1024 * 1024 }))).toBe(true);
  });

  it('does not warn about a file that is already rejected as too large', () => {
    expect(isSlowUpload(makeFile({ size: CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES + 1 }))).toBe(false);
  });
});

describe('toMegabytes', () => {
  it('reports whole megabytes for a user facing message', () => {
    expect(toMegabytes(180 * 1024 * 1024)).toBe(180);
    expect(toMegabytes(1024 * 1024)).toBe(1);
  });
});

// validateVideoDuration is not unit tested here because it needs a live
// browser media pipeline (HTMLVideoElement.loadedmetadata). The component
// contract is that every File passes through it before upload.
