import { describe, it, expect, afterEach, vi } from 'vitest';
import { isInAppBrowser } from './inAppBrowser';

/** Helper: override navigator.userAgent for a single test */
function setUA(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  // Restore a neutral UA after each test so tests stay independent
  setUA('Mozilla/5.0');
});

describe('isInAppBrowser', () => {
  // --- SSR guard ---
  it('returns false when window is undefined (SSR)', () => {
    const origWindow = global.window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- intentional SSR simulation
    delete (global as any).window;
    expect(isInAppBrowser()).toBe(false);
    global.window = origWindow;
  });

  // --- Known in-app browsers ---
  it('detects Facebook (FBAN)', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone13,2;FBMD/iPhone;FBSN/iOS;FBSV/15.0;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects Facebook (FBAV)', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Mobile Safari/537.36 FBAV/321.0.0.0.0'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects Instagram', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 195.0.0.31.123'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects generic Android WebView (; wv)', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 10; SM-G973F Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.96 Mobile Safari/537.36'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects WeChat (MicroMessenger)', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 9; MI 9 Build/PKQ1.181121.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/66.0.3359.126 Mobile Safari/537.36 MicroMessenger/7.0.5.1440(0x27000539)'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects TikTok (musical_ly)', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly/21.6.0'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects TikTok (TikTok)', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 10; SM-A505F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.127 Mobile Safari/537.36 TikTok/15.0.3'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects Twitter/X', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter/9.14'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects LinkedIn (LinkedInApp)', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LinkedInApp/9.26.7052'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects Snapchat', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Snapchat/11.59.0.36 Mobile'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  it('detects Line', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/12.3.1'
    );
    expect(isInAppBrowser()).toBe(true);
  });

  // --- Regular browsers (must return false) ---
  it('returns false for Chrome on Android', () => {
    setUA(
      'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Mobile Safari/537.36'
    );
    expect(isInAppBrowser()).toBe(false);
  });

  it('returns false for Safari on iOS', () => {
    setUA(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    );
    expect(isInAppBrowser()).toBe(false);
  });

  it('returns false for desktop Chrome', () => {
    setUA(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );
    expect(isInAppBrowser()).toBe(false);
  });

  it('returns false for Firefox on Android', () => {
    setUA('Mozilla/5.0 (Android 12; Mobile; rv:102.0) Gecko/102.0 Firefox/102.0');
    expect(isInAppBrowser()).toBe(false);
  });
});
