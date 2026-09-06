/**
 * Client side guardrails for instructor intro video uploads.
 *
 * These ran against Supabase storage originally, where the file was served
 * back byte for byte, so the MIME type and the file size both mattered.
 * Uploads now go to Cloudflare Stream, which transcodes any common container
 * and codec and bills by duration rather than by bytes, so both of those
 * checks were removed. What is left is the check that still costs money if it
 * is wrong.
 *
 * Duration stays at 60 seconds and is deliberately below the 120 second
 * maxDurationSeconds the mint route declares. Cloudflare reserves storage for
 * the declared maximum from the moment a link is minted, so that gap is
 * headroom for a slightly long file, not permission to upload one.
 *
 * Still pure and DOM free apart from duration detection, so it unit tests
 * without a browser or a Supabase instance.
 */

export const MAX_VIDEO_SECONDS = 60;

/** Any video container. Stream rejects what it cannot transcode. */
export const ACCEPTED_VIDEO_TYPE_PREFIX = 'video/';

export type VideoValidationError = 'wrong_type' | 'too_long';

/**
 * Synchronous check: is this a video at all.
 *
 * Size is not checked. Stream accepts up to 200 MB on the basic upload path
 * and a 60 second clip is far below that, and the byte count no longer
 * affects the bill.
 */
export function validateVideoSync(file: File): VideoValidationError | null {
  if (!file.type.toLowerCase().startsWith(ACCEPTED_VIDEO_TYPE_PREFIX)) return 'wrong_type';
  return null;
}

/**
 * Async check: duration via a hidden video element.
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
      // Treat unreadable files as passing the duration check. Stream will
      // reject a file it cannot read, and blocking on a flaky metadata reader
      // is worse than letting the server have the final say.
      URL.revokeObjectURL(url);
      resolve(null);
    };

    video.src = url;
  });
}
