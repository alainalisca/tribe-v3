import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const getUser = vi.fn();
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getUser } }) }));

import { applySecurityHeaders } from './middleware';

describe('middleware canonical Link header', () => {
  it('is set on a successful page response', () => {
    const res = applySecurityHeaders(NextResponse.next(), '/about/');
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/about/>; rel="canonical"');
  });

  it('is not set on a redirect, which is not a page to index', () => {
    const res = applySecurityHeaders(NextResponse.redirect(new URL('https://tribelatam.com/auth/')), '/profile/');
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('Link')).toBeNull();
  });

  it('is not set on the gated 404', () => {
    const res = applySecurityHeaders(
      NextResponse.rewrite(new URL('https://tribelatam.com/__nf/'), { status: 404 }),
      '/atletas/'
    );
    expect(res.headers.get('Link')).toBeNull();
  });

  it('is not set for API routes or routes with their own canonical', () => {
    expect(applySecurityHeaders(NextResponse.next(), '/api/geocode/').headers.get('Link')).toBeNull();
    expect(applySecurityHeaders(NextResponse.next(), '/g/bullbox/').headers.get('Link')).toBeNull();
  });

  it('keeps the security headers either way', () => {
    const res = applySecurityHeaders(NextResponse.next(), '/about/');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});

/**
 * The helper tests above cannot see whether middleware() actually passes the
 * path at each return. These run the whole middleware on its two success
 * branches: a public page (short-circuit) and a signed-in private page.
 */
describe('middleware() sets the canonical on both success branches', () => {
  it('public page', async () => {
    const { middleware } = await import('./middleware');
    const res = await middleware(new NextRequest('https://tribe-v3.vercel.app/about/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/about/>; rel="canonical"');
  });

  it('signed-in private page', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const { middleware } = await import('./middleware');
    const res = await middleware(new NextRequest('https://tribelatam.com/profile/'));
    expect(getUser).toHaveBeenCalled(); // really took the auth branch
    expect(res.status).toBe(200);
    expect(res.headers.get('Link')).toBe('<https://tribelatam.com/profile/>; rel="canonical"');
  });

  it('signed-out private page redirects, with no canonical', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { middleware } = await import('./middleware');
    const res = await middleware(new NextRequest('https://tribelatam.com/profile/'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.headers.get('Link')).toBeNull();
  });
});
