import { describe, it, expect } from 'vitest';
import { validateVideoSync, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, ACCEPTED_VIDEO_TYPE } from './videoValidation';

function makeFile(opts: { type?: string; size?: number; name?: string }): File {
  const { type = ACCEPTED_VIDEO_TYPE, size = 1024, name = 'intro.mp4' } = opts;
  // File constructor accepts a Uint8Array so we can control size exactly.
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('validateVideoSync', () => {
  it('passes a valid MP4 file within size limit', () => {
    const file = makeFile({ type: 'video/mp4', size: 10 * 1024 * 1024 });
    expect(validateVideoSync(file)).toBeNull();
  });

  it('rejects a file that is not video/mp4 (mov)', () => {
    const file = makeFile({ type: 'video/quicktime', name: 'intro.mov' });
    expect(validateVideoSync(file)).toBe('wrong_type');
  });

  it('rejects a file that is not video/mp4 (webm)', () => {
    const file = makeFile({ type: 'video/webm', name: 'intro.webm' });
    expect(validateVideoSync(file)).toBe('wrong_type');
  });

  it('rejects a file that is not video/mp4 (image masquerading)', () => {
    const file = makeFile({ type: 'image/jpeg', name: 'photo.jpg' });
    expect(validateVideoSync(file)).toBe('wrong_type');
  });

  it('rejects a file exceeding MAX_VIDEO_BYTES', () => {
    const file = makeFile({ type: 'video/mp4', size: MAX_VIDEO_BYTES + 1 });
    expect(validateVideoSync(file)).toBe('too_large');
  });

  it('accepts a file exactly at MAX_VIDEO_BYTES', () => {
    const file = makeFile({ type: 'video/mp4', size: MAX_VIDEO_BYTES });
    expect(validateVideoSync(file)).toBeNull();
  });

  it('wrong type is caught before size — type error wins', () => {
    // Both violations present; type check runs first.
    const file = makeFile({ type: 'video/quicktime', size: MAX_VIDEO_BYTES + 1 });
    expect(validateVideoSync(file)).toBe('wrong_type');
  });

  it('exports caps as named constants (sanity)', () => {
    expect(MAX_VIDEO_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_VIDEO_SECONDS).toBe(60);
    expect(ACCEPTED_VIDEO_TYPE).toBe('video/mp4');
  });
});

// validateVideoDuration is not unit-tested here because it requires a live
// browser media pipeline (HTMLVideoElement.loadedmetadata). It is covered by
// the contract that the component passes the File through this helper before
// uploading — integration/e2e tests would exercise the full flow.
