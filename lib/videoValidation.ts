/**
 * Client-side guardrails for instructor intro video uploads (BUG-211).
 *
 * All validation is intentionally pure and synchronous (or returns a Promise
 * only for duration detection) so it can be unit-tested without a DOM or a
 * Supabase instance. The upload component calls these helpers before sending
 * any bytes to Storage.
 */

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEO_SECONDS = 60;
export const ACCEPTED_VIDEO_TYPE = 'video/mp4';

export type VideoValidationError = 'too_large' | 'wrong_type' | 'too_long';

/**
 * Synchronous checks: MIME type and file size.
 * Returns the first violation found, or null on pass.
 */
export function validateVideoSync(file: File): VideoValidationError | null {
  if (file.type !== ACCEPTED_VIDEO_TYPE) return 'wrong_type';
  if (file.size > MAX_VIDEO_BYTES) return 'too_large';
  return null;
}

/**
 * Async check: duration via a hidden <video> element.
 * Resolves with 'too_long' if duration exceeds the cap, null otherwise.
 * Cleans up the object URL when done.
 *
 * Callers in tests can mock this via vi.fn() since duration detection
 * requires a real browser media pipeline.
 */
export function validateVideoDuration(file: File): Promise<VideoValidationError | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration > MAX_VIDEO_SECONDS ? 'too_long' : null);
    };

    video.onerror = () => {
      // Treat unreadable files as passing duration check — the upload will
      // fail at the server anyway, and we don't want to block on a bad
      // metadata reader.
      URL.revokeObjectURL(url);
      resolve(null);
    };

    video.src = url;
  });
}
