/**
 * Safe "go back".
 *
 * Plain `window.history.back()` does nothing (or exits the PWA) when a
 * page was opened cold from a shared/deep link — and storefront,
 * session, and profile pages are exactly the screens people open that
 * way. This goes back only when there's in-app history to return to,
 * otherwise navigates to a sensible fallback.
 */
export function goBack(fallback = '/'): void {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.assign(fallback);
  }
}
