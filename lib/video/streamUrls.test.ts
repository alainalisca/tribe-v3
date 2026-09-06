import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  resolveVideoSource,
  isStreamUid,
  streamIframeUrl,
  streamThumbnailUrl,
  STREAM_IFRAME_ALLOW,
} from './streamUrls';

/**
 * users.storefront_video_url holds two shapes and there is no migration:
 * three legacy rows hold full Supabase URLs, new rows hold a bare Cloudflare
 * Stream uid. This module is the only place allowed to know the difference,
 * so the discrimination and the fail closed behaviour are pinned here.
 */

const HOST = 'customer-test123.cloudflarestream.com';
const LEGACY = 'https://twyplulysepbeypqralz.supabase.co/storage/v1/object/public/media/storefront-videos/a.mp4';
const ORIGINAL = process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

beforeEach(() => {
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = HOST;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;
  else process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = ORIGINAL;
});

describe('isStreamUid', () => {
  it('treats an https URL as a legacy direct source', () => {
    expect(isStreamUid(LEGACY)).toBe(false);
  });

  it('treats a plain http URL as a legacy direct source', () => {
    expect(isStreamUid('http://example.com/a.mp4')).toBe(false);
  });

  it('treats a bare identifier as a Stream uid', () => {
    expect(isStreamUid('b236bde30eb07b9d01318940e5fc3eda')).toBe(true);
  });
});

describe('URL builders', () => {
  it('builds an iframe URL carrying autoplay=true and preload=none', () => {
    expect(streamIframeUrl('vid_1', HOST)).toBe(`https://${HOST}/vid_1/iframe?autoplay=true&preload=none`);
  });

  it('builds a thumbnail URL, which bills as an image and not as delivery', () => {
    expect(streamThumbnailUrl('vid_1', HOST)).toBe(`https://${HOST}/vid_1/thumbnails/thumbnail.jpg`);
  });

  it('delegates autoplay to the iframe, without which autoplay=true is ignored', () => {
    // A cross origin iframe cannot autoplay unless the parent grants the
    // permission here. Omitting it cost a second click inside the player.
    expect(STREAM_IFRAME_ALLOW).toContain('autoplay');
  });

  it('keeps the rest of the permissions Cloudflare documents', () => {
    for (const permission of ['accelerometer', 'gyroscope', 'encrypted-media', 'picture-in-picture']) {
      expect(STREAM_IFRAME_ALLOW).toContain(permission);
    }
  });
});

describe('resolveVideoSource', () => {
  it('resolves a legacy URL to a direct source, unchanged', () => {
    expect(resolveVideoSource(LEGACY)).toEqual({ kind: 'direct', src: LEGACY });
  });

  it('resolves a uid to a stream source with both URLs', () => {
    expect(resolveVideoSource('vid_1')).toEqual({
      kind: 'stream',
      uid: 'vid_1',
      iframeUrl: `https://${HOST}/vid_1/iframe?autoplay=true&preload=none`,
      thumbnailUrl: `https://${HOST}/vid_1/thumbnails/thumbnail.jpg`,
    });
  });

  it.each([null, undefined, '', '   '])('resolves %p to unavailable', (value) => {
    expect(resolveVideoSource(value)).toEqual({ kind: 'unavailable' });
  });

  it('fails closed: a uid with no configured subdomain is unavailable, never a half built URL', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

    expect(resolveVideoSource('vid_1')).toEqual({ kind: 'unavailable' });
  });

  it('still plays legacy rows when the subdomain is missing, since they need no host', () => {
    delete process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN;

    expect(resolveVideoSource(LEGACY)).toEqual({ kind: 'direct', src: LEGACY });
  });

  it('tolerates a subdomain configured with a scheme or a trailing slash', () => {
    process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_SUBDOMAIN = `https://${HOST}/`;

    expect(resolveVideoSource('vid_1')).toMatchObject({
      iframeUrl: `https://${HOST}/vid_1/iframe?autoplay=true&preload=none`,
    });
  });
});
