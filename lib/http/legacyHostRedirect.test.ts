import { describe, it, expect } from 'vitest';
import { legacyHostRedirect, isEmbeddedWebView, type LegacyHostRequest } from './legacyHostRedirect';

/**
 * T-DOMAIN1 step 3. The redirect has to move people to tribelatam.com without
 * touching the one client that cannot follow it: the installed native app,
 * whose WebView loads tribe-v3.vercel.app (capacitor.config.ts server.url).
 */

const UA = {
  // Capacitor sets no custom agent; these are the platform WebView defaults.
  capacitorIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  capacitorIpad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  capacitorAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240905.003; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  whatsapp: 'WhatsApp/2.24.20.80 A',
  imessage:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

function req(over: Partial<LegacyHostRequest> = {}): LegacyHostRequest {
  return {
    host: 'tribe-v3.vercel.app',
    method: 'GET',
    pathname: '/session/abc/',
    search: '',
    userAgent: UA.iosSafari,
    ...over,
  };
}

describe('legacyHostRedirect: who moves', () => {
  it.each([
    ['iOS Safari', UA.iosSafari],
    ['Chrome on iOS', UA.iosChrome],
    ['Android Chrome', UA.androidChrome],
    ['desktop Chrome', UA.desktopChrome],
    ['desktop Firefox', UA.desktopFirefox],
    ['Googlebot (so the 301 moves search standing)', UA.googlebot],
    ['no user agent at all', null],
  ])('%s is sent to tribelatam.com', (_name, userAgent) => {
    expect(legacyHostRedirect(req({ userAgent }))).toBe('https://tribelatam.com/session/abc/');
  });

  it('keeps the path and the query string (old shared links, T-shirt QR codes)', () => {
    expect(legacyHostRedirect(req({ pathname: '/pase/bullbox/', search: '?src=shirt&utm_source=qr' }))).toBe(
      'https://tribelatam.com/pase/bullbox/?src=shirt&utm_source=qr'
    );
    expect(legacyHostRedirect(req({ pathname: '/' }))).toBe('https://tribelatam.com/');
  });

  it('matches the host case-insensitively and with a port', () => {
    expect(legacyHostRedirect(req({ host: 'Tribe-V3.Vercel.App:443' }))).toBe('https://tribelatam.com/session/abc/');
  });

  it('redirects HEAD as well as GET', () => {
    expect(legacyHostRedirect(req({ method: 'HEAD' }))).not.toBeNull();
  });
});

describe('legacyHostRedirect: who stays', () => {
  it.each([
    ['the Capacitor iOS app', UA.capacitorIos],
    ['the Capacitor iPad app', UA.capacitorIpad],
    ['the Capacitor Android app', UA.capacitorAndroid],
    ['the WhatsApp preview scraper', UA.whatsapp],
    ['the iMessage preview scraper', UA.imessage],
  ])('%s is served in place', (_name, userAgent) => {
    expect(legacyHostRedirect(req({ userAgent }))).toBeNull();
  });

  it.each(['tribelatam.com', 'www.tribelatam.com', 'tribe-v3-git-feature-x-alainalisca.vercel.app', 'localhost:3000'])(
    'other host %s is untouched',
    (host) => {
      expect(legacyHostRedirect(req({ host }))).toBeNull();
    }
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])('%s is never redirected', (method) => {
    expect(legacyHostRedirect(req({ method }))).toBeNull();
  });

  it.each([
    '/api/payment/webhook/stripe/',
    '/api/cron/engagement/',
    '/api',
    '/.well-known/apple-app-site-association',
    '/.well-known/assetlinks.json',
    '/_next/data/abc/index.json',
    '/ingest/e/',
    '/sw.js',
    '/manifest.json',
    '/sitemap.xml',
    '/images/logo.png',
  ])('%s is served in place', (pathname) => {
    expect(legacyHostRedirect(req({ pathname }))).toBeNull();
  });

  it('does not treat a page whose path merely starts with "api" as exempt', () => {
    expect(legacyHostRedirect(req({ pathname: '/apiary/' }))).toBe('https://tribelatam.com/apiary/');
  });
});

describe('isEmbeddedWebView', () => {
  it('flags the WebViews and nothing else', () => {
    expect(isEmbeddedWebView(UA.capacitorIos)).toBe(true);
    expect(isEmbeddedWebView(UA.capacitorIpad)).toBe(true);
    expect(isEmbeddedWebView(UA.capacitorAndroid)).toBe(true);
    expect(isEmbeddedWebView(UA.iosSafari)).toBe(false);
    expect(isEmbeddedWebView(UA.iosChrome)).toBe(false);
    expect(isEmbeddedWebView(UA.androidChrome)).toBe(false);
    expect(isEmbeddedWebView(UA.desktopChrome)).toBe(false);
    expect(isEmbeddedWebView(UA.desktopFirefox)).toBe(false);
  });
});
