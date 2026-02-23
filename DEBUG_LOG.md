# Tribe v3 Debug Log

## Resolved Issues

**DATE:** Feb 23, 2026
**PROBLEM:** Push notifications not reaching iOS device — FCM failing with "third-party-auth-error"
**ROOT CAUSE:** Three issues: (1) Firebase Admin SDK auth broken on Vercel serverless — stale credential caching. (2) APNs development key missing in Firebase Cloud Messaging settings — debug Xcode builds use sandbox APNs. (3) Test endpoint had wrong user ID.
**FIX:** Replaced Firebase Admin SDK with direct FCM HTTP v1 API calls using manual JWT→OAuth2 flow. Uploaded APNs auth key to both development and production slots in Firebase. Fixed test endpoint user ID and added comprehensive diagnostics.

---

**DATE:** Feb 23, 2026
**PROBLEM:** Content too tight against fixed headers on all pages, long address wrapping in chat header
**ROOT CAUSE:** pt-header class had no breathing room after the header, chat location text had no truncation
**FIX:** Added +0.5rem to pt-header calculation, +8px to my-sessions paddingTop, added truncate max-w-[250px] to chat location text

---

**DATE:** Feb 23, 2026
**PROBLEM:** "0 sessions" text overlapping with StoriesRow story circles
**ROOT CAUSE:** Fixed header height wasn't re-measured when filter elements appeared/disappeared — measureFixed only triggered on resize and userLocation change
**FIX:** Added loading, searchQuery, selectedSport, filteredSessions.length as dependencies to measureFixed effect with requestAnimationFrame

---

**DATE:** Feb 23, 2026
**PROBLEM:** Stories closing after ~2 seconds instead of full 5-second duration
**ROOT CAUSE:** Race condition between two useEffects with same dependency — timer effect could run before reset effect, starting with stale elapsed time from previous story
**FIX:** Moved elapsedRef reset into the timer effect itself, eliminated separate reset useEffect

---

**DATE:** Feb 23, 2026
**PROBLEM:** Cannot scroll on any page in iOS Capacitor app
**ROOT CAUSE:** `scrollEnabled: false` in capacitor.config.ts disabled WKWebView native scrolling entirely
**FIX:** Changed to `scrollEnabled: true` — CSS `overscroll-behavior: none` handles bounce prevention instead

---

**DATE:** Feb 22, 2026
**PROBLEM:** Video upload stuck on "Posting..." indefinitely
**ROOT CAUSE:** Supabase Storage upload and thumbnail generator could hang silently on iOS WKWebView — no timeout, no error handling
**FIX:** Added Promise.race timeout (120s video, 30s image), 5s thumbnail timeout, pre-flight size check, bilingual error toasts

---

**DATE:** Feb 22, 2026
**PROBLEM:** No video duration limit — users could upload 10-minute videos
**ROOT CAUSE:** No duration validation existed in handleFileSelect()
**FIX:** Added 60-second max check via hidden video element metadata load, with 3s fallback timeout, bilingual toast

---

**DATE:** Feb 22, 2026
**PROBLEM:** Home page content shifting horizontally, Tribe logo disappearing
**ROOT CAUSE:** StoriesRow `-mx-4` negative margins caused horizontal overflow, no parent clipping
**FIX:** Moved `overflow-x: hidden` to html/body in globals.css instead of page div (which broke iOS scroll)

---

**DATE:** Feb 22, 2026
**PROBLEM:** Distance slider "All"/"100km" label clipped on right edge
**ROOT CAUSE:** `min-w-[40px]` too narrow for label text, flex container could squeeze it
**FIX:** Changed to `min-w-[48px]` with `flex-shrink-0`

---

**DATE:** Feb 22, 2026
**PROBLEM:** EN/ES language toggle disappearing from header on narrow screens
**ROOT CAUSE:** No `flex-shrink-0` on toggle container, header gap too wide
**FIX:** Added `flex-shrink-0` to LanguageToggle, reduced header gap from `gap-4` to `gap-3`

---

**DATE:** Feb 22, 2026
**PROBLEM:** My Sessions first card clipped behind fixed header
**ROOT CAUSE:** Default headerHeight 140px too small for iOS safe area, measureHeader() ran before DOM resolved CSS env() values
**FIX:** Increased default to 180px, added requestAnimationFrame re-measure after loading completes
