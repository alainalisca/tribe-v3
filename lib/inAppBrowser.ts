/** Utility: detect embedded in-app browsers (webviews) that block Google/Apple OAuth */

/**
 * Returns true when the page is running inside a known in-app browser / embedded
 * webview that blocks Google "disallowed_useragent" OAuth flows.
 *
 * Guards for SSR: returns false when navigator / window are unavailable.
 *
 * Covered shells: Facebook, Instagram, generic Android WebView, Line, Snapchat,
 * Twitter/X, TikTok/ByteDance, WeChat, LinkedIn.
 */
export function isInAppBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent;

  const inAppPatterns: RegExp[] = [
    /FBAN|FBAV/i, // Facebook
    /Instagram/i, // Instagram
    /; wv\)/i, // Generic Android WebView (e.g. Chrome Custom Tab wrapper)
    /\bLine\b/i, // Line
    /Snapchat/i, // Snapchat
    /Twitter/i, // Twitter / X
    /musical_ly|Bytedance|TikTok/i, // TikTok
    /MicroMessenger/i, // WeChat
    /LinkedInApp/i, // LinkedIn
  ];

  return inAppPatterns.some((pattern) => pattern.test(ua));
}
