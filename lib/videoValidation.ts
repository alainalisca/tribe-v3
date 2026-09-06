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

/**
 * Transport ceiling, not a billing one.
 *
 * Cloudflare's simple POST path for a direct creator upload accepts at most
 * 200 MB. Anything larger is refused with a 4xx no matter how short it is,
 * and Cloudflare requires the tus protocol above that line. 180 MB leaves
 * headroom for multipart framing and for a phone that reports a slightly
 * different size than it sends.
 *
 * This number is reachable well inside our own 60 second duration cap: a 4K
 * HDR clip from a recent iPhone runs past 200 MB in under a minute, which is
 * why duration alone is not a sufficient guard.
 *
 * Do not raise this constant to accept bigger files. Above 200 MB the simple
 * POST path cannot work at all, so the fix is implementing tus, which needs a
 * different mint endpoint and a client library. Editing the number just moves
 * the failure from a clear message to an opaque 4xx.
 */
export const CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES = 180 * 1024 * 1024;

/**
 * Above this the upload is worth warning about but still allowed. On mobile
 * data a file this size can take minutes, and silence during that wait is
 * what makes a working upload feel broken.
 */
export const SLOW_UPLOAD_WARNING_BYTES = 60 * 1024 * 1024;

export type VideoValidationError = 'wrong_type' | 'too_long' | 'too_large';

/** Whole megabytes, for user facing messages. */
export function toMegabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

/** True when the file is large enough to be worth warning about first. */
export function isSlowUpload(file: File): boolean {
  return file.size > SLOW_UPLOAD_WARNING_BYTES && file.size <= CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES;
}

/**
 * Synchronous checks: is this a video, and can it physically be uploaded.
 *
 * Both run before the mint route is called. A file rejected here never burns
 * a direct upload URL, which would otherwise reserve storage on Cloudflare
 * for the life of the link.
 */
export function validateVideoSync(file: File): VideoValidationError | null {
  if (!file.type.toLowerCase().startsWith(ACCEPTED_VIDEO_TYPE_PREFIX)) return 'wrong_type';
  if (file.size > CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES) return 'too_large';
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
