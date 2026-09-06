/**
 * The one place that knows how to read users.storefront_video_url.
 *
 * The column holds two shapes and there is no migration planned:
 *   - legacy rows hold a full Supabase storage URL, written by the old
 *     upload path, and must keep playing exactly as they do today;
 *   - new rows hold a bare Cloudflare Stream uid.
 *
 * Everything else in the app treats the column as an opaque string. Keep the
 * discrimination here so a third shape, if it ever arrives, is a one file
 * change rather than a hunt.
 *
 * These helpers build URLs only. They never touch the Stream account token,
 * which is server side in lib/video/stream.ts and must never reach a bundle.
 */

/** Playback shape resolved from a stored column value. */
export type VideoSource =
  /** Legacy row: a direct media URL for a native video element. */
  | { kind: 'direct'; src: string }
  /** Cloudflare Stream row: an iframe embed plus a real frame for the poster. */
  | { kind: 'stream'; uid: string; iframeUrl: string; thumbnailUrl: string }
  /**
   * Nothing playable. Either the column is empty, or it holds a uid while
   * NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN is absent. Callers must treat
   * this exactly like an empty column and render no player, because a
   * half built Stream URL is a broken embed rather than a graceful one.
   */
  | { kind: 'unavailable' };

/**
 * Legacy values are absolute Supabase URLs, so the protocol is the
 * discriminator. A Stream uid is a bare identifier and never starts with a
 * scheme. Deliberately loose: any absolute http or https URL is treated as a
 * direct source, which is what the old rows are.
 */
export function isStreamUid(value: string): boolean {
  return !value.trim().toLowerCase().startsWith('http');
}

/**
 * Read at call time rather than at module load. Next inlines NEXT_PUBLIC_
 * values at build, and reading it here keeps the helper testable.
 * The variable holds a bare host, for example customer-abc123.cloudflarestream.com,
 * with no scheme and no trailing slash.
 */
function streamHost(): string | null {
  const host = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  if (!host) return null;
  return (
    host
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '') || null
  );
}

/**
 * The Stream player embed. autoplay is set because this URL is only ever
 * built after the viewer has clicked play, so it continues the gesture they
 * already made. preload=none keeps the player from pulling segments before
 * that, which is billable delivery.
 */
export function streamIframeUrl(uid: string, host: string): string {
  return `https://${host}/${encodeURIComponent(uid)}/iframe?autoplay=true&preload=none`;
}

/**
 * Permissions delegated to the Stream player iframe.
 *
 * autoplay is load bearing and its omission was a bug. A cross origin iframe
 * cannot autoplay at all unless the parent delegates the permission here, so
 * without it the autoplay=true in the URL is silently ignored and the viewer
 * has to press play a second time inside Cloudflare's own player. This list
 * matches Cloudflare's documented embed snippet.
 *
 * Kept beside the URL builder so the two cannot drift apart again.
 */
export const STREAM_IFRAME_ALLOW = 'accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;';

/**
 * A real frame from the video. Billed as an image request, not as delivery
 * minutes, so it is safe to show on a storefront that is never played.
 */
export function streamThumbnailUrl(uid: string, host: string): string {
  return `https://${host}/${encodeURIComponent(uid)}/thumbnails/thumbnail.jpg`;
}

/** Resolve a stored column value into something renderable, or unavailable. */
export function resolveVideoSource(value: string | null | undefined): VideoSource {
  const trimmed = value?.trim();
  if (!trimmed) return { kind: 'unavailable' };

  if (!isStreamUid(trimmed)) {
    return { kind: 'direct', src: trimmed };
  }

  // Fail closed: a uid with no configured host cannot produce a valid embed.
  const host = streamHost();
  if (!host) return { kind: 'unavailable' };

  return {
    kind: 'stream',
    uid: trimmed,
    iframeUrl: streamIframeUrl(trimmed, host),
    thumbnailUrl: streamThumbnailUrl(trimmed, host),
  };
}
