import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const pathname = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));

import RouteLoadingFallback, { isPublicFramePath } from './RouteLoadingFallback';

/**
 * T-SSR1: the root loading fallback is a plain paper blank on public pages
 * (no app chrome flashing over a Jornada page) and today's skeleton everywhere
 * else.
 */
const SIGNED_OUT = 'tribe_lang=es';
const SIGNED_IN = 'sb-ref-auth-token.0=x; tribe_lang=es';

describe('isPublicFramePath', () => {
  it('session and coach pages, the site and its internal paths are paper', () => {
    for (const path of [
      '/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/',
      '/i/salotaba/',
      '/sitio/es/tv/',
      '/coaches/',
      '/tv/',
    ]) {
      expect(isPublicFramePath(path, SIGNED_IN)).toBe(true);
    }
  });

  it('`/` is paper only when the browser shows no session cookie', () => {
    expect(isPublicFramePath('/', SIGNED_OUT)).toBe(true);
    expect(isPublicFramePath('/', '')).toBe(true);
    expect(isPublicFramePath('/', SIGNED_IN)).toBe(false);
    // On the server the cookie is unknown: the feed's skeleton.
    expect(isPublicFramePath('/', null)).toBe(false);
  });

  it('app routes keep the skeleton', () => {
    for (const path of [
      '/profile/',
      '/sessions/',
      '/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/edit/',
      '/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/chat/',
      '/messages/',
      '/os/',
      '/admin/',
      '/create/',
    ]) {
      expect(isPublicFramePath(path, SIGNED_OUT)).toBe(false);
    }
  });
});

describe('RouteLoadingFallback', () => {
  beforeEach(() => {
    document.cookie = 'sb-ref-auth-token=; Max-Age=0';
  });

  it('renders the paper blank on a session page, with no app chrome', () => {
    pathname.current = '/session/cfcafad0-80ec-43ea-a018-eafcf99c8648/';
    const { container } = render(<RouteLoadingFallback />);
    const blank = container.querySelector('[data-fallback]') as HTMLElement;
    expect(blank.dataset.fallback).toBe('paper');
    expect(blank.style.background).toBe('rgb(244, 243, 238)');
    expect(blank.children).toHaveLength(0);
  });

  it('renders today’s skeleton on an app route', () => {
    pathname.current = '/profile/';
    const { container } = render(<RouteLoadingFallback />);
    const app = container.querySelector('[data-fallback]') as HTMLElement;
    expect(app.dataset.fallback).toBe('app');
    expect(app.className).toBe('min-h-screen bg-theme-page');
    expect(app.querySelector(':scope > div > .space-y-3')!.children).toHaveLength(4);
  });
});
