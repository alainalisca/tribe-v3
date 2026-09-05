import { describe, it, expect } from 'vitest';
import { buildCsp } from './middleware';

// The CSP built here is the one served on every route (next.config.ts has no
// headers() block and vercel.json has no headers). Media elements fall back to
// default-src 'self' unless media-src is set, which is why Supabase-hosted intro
// videos never played in production and why Cloudflare Stream would be blocked
// on upload (connect-src), playback (media-src) and the iframe player
// (frame-src). These tests pin the hosts each directive must carry.

function directive(csp: string, name: string): string {
  const entry = csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  if (!entry) throw new Error(`CSP has no ${name} directive: ${csp}`);
  return entry.slice(name.length + 1);
}

describe('buildCsp media and Cloudflare Stream hosts', () => {
  const csp = buildCsp();

  it('sets media-src explicitly with self, blob, Supabase and Cloudflare Stream hosts', () => {
    const mediaSrc = directive(csp, 'media-src');
    expect(mediaSrc).toContain("'self'");
    expect(mediaSrc).toContain('blob:');
    expect(mediaSrc).toContain('https://*.supabase.co');
    expect(mediaSrc).toContain('https://*.cloudflarestream.com');
    expect(mediaSrc).toContain('https://videodelivery.net');
  });

  it('allows the Stream direct upload POST and HLS fetches in connect-src', () => {
    const connectSrc = directive(csp, 'connect-src');
    expect(connectSrc).toContain('https://*.cloudflarestream.com');
    expect(connectSrc).toContain('https://videodelivery.net');
    expect(connectSrc).toContain('https://upload.videodelivery.net');
    // Existing hosts must survive the extension.
    expect(connectSrc).toContain('https://*.supabase.co');
    expect(connectSrc).toContain('wss://*.supabase.co');
  });

  it('allows the Stream iframe player in frame-src without dropping vercel.live', () => {
    const frameSrc = directive(csp, 'frame-src');
    expect(frameSrc).toContain('https://*.cloudflarestream.com');
    expect(frameSrc).toContain('https://vercel.live');
    expect(frameSrc).toContain("'self'");
  });

  it('leaves the unrelated directives as they were', () => {
    expect(directive(csp, 'default-src')).toBe("'self'");
    expect(directive(csp, 'style-src')).toBe("'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com");
    expect(directive(csp, 'img-src')).toBe("'self' https: data: blob:");
    expect(directive(csp, 'object-src')).toBe("'none'");
    expect(directive(csp, 'frame-ancestors')).toBe("'none'");
  });
});
