---
name: capacitor-checker
description: "Checks code for cross-platform compatibility issues between web, iOS (WKWebView), and Android (WebView). Triggers when Claude uses browser APIs, CSS features that behave differently on mobile, touch events, camera/media access, push notifications, geolocation, local storage, scroll behavior, position:fixed elements, or any code that could behave differently in Capacitor's native wrapper versus a standard browser. Also triggers when the user mentions 'iOS', 'Android', 'Capacitor', 'native', 'mobile', or 'device testing'."
---

# Capacitor Compatibility Checker

Tribe v3 runs as a PWA on web and as a native app via Capacitor on iOS (WKWebView) and Android (WebView). Code that works in Chrome may break on devices.

## Known iOS/WKWebView Issues

### Scrolling
- `overflow: auto` can cause scroll jank in WKWebView — prefer `overflow-y: auto` with `-webkit-overflow-scrolling: touch`
- `position: fixed` elements can jump when the iOS keyboard opens — use `visual viewport` API or CSS `env(safe-area-inset-*)`
- Momentum scrolling can cause fixed headers to scroll away temporarily

### Safe Areas
- Always use `safe-area-top` / `safe-area-bottom` classes on fixed headers and bottom navs
- iPhone notch and Dynamic Island need `env(safe-area-inset-top)` padding
- Home indicator bar needs `env(safe-area-inset-bottom)` padding

### Media
- Video autoplay requires `muted` and `playsinline` attributes on iOS
- Camera access uses Capacitor Camera plugin, not `navigator.mediaDevices`
- File uploads via `<input type="file">` work but may not support `capture` attribute consistently
- Large image uploads can cause memory pressure — always compress before uploading

### Push Notifications
- Web uses Firebase Cloud Messaging (FCM) via service worker
- iOS uses APNs via Capacitor Push Notifications plugin
- Registration flow differs: web needs user permission click, iOS requests at app start
- Token format is different: FCM tokens (web) vs APNs device tokens (iOS)

### Storage
- `localStorage` has a ~5MB limit in WKWebView
- IndexedDB works but with stricter quotas
- Cookies work but may be cleared more aggressively by iOS

### Navigation
- `window.history.pushState/popState` works but back button behavior differs
- Deep links require proper Capacitor app URL handling
- `window.open()` may be blocked — use Capacitor Browser plugin for external links

## Known Android/WebView Issues

- Older WebViews may not support newer CSS (e.g., `gap` in flexbox)
- `position: fixed` + virtual keyboard = layout issues (similar to iOS)
- Service worker registration may fail silently on some Android versions

## Deployment Notes

- **Tribe iOS loads from Vercel** (server.url in capacitor.config.ts), not a local build
- Web changes: `git push` → Vercel deploys → force-close app → reopen to test
- Native-only changes: `npx cap sync` → rebuild in Xcode/Android Studio
- CSS/JS changes don't require a new App Store submission — they load from the server

## Checklist for New Code

When writing code that uses any of these, verify it works on all platforms:
- [ ] `position: fixed` — safe area insets included?
- [ ] Scroll containers — `-webkit-overflow-scrolling: touch` added?
- [ ] File upload — compressed before sending?
- [ ] Video/audio — `playsinline muted` attributes?
- [ ] Push notifications — both FCM and APNs paths handled?
- [ ] External links — using Capacitor Browser plugin, not `window.open`?
- [ ] Storage — within 5MB limit? Fallback if cleared?
