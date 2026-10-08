'use client';

/**
 * T-GROW1 part A, the mount point. Renders nothing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY IT LIVES IN THE ROOT LAYOUT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The spec's words are "call it from the root client layout so every route
 * captures, not only storefronts", and the measurement behind that is in
 * lib/attribution.ts: 2 of the 3 live pass leads carry no source at all, because
 * `src` and `code` were read in PaseForm's mount effect and nowhere else. A
 * person who landed on `/?src=runclub&code=RUNCLUB-SAT0927`, browsed, and then
 * opened the pass arrived with no parameters.
 *
 * There is no root CLIENT layout in this app -- app/layout.tsx is a server
 * component -- so this is the client boundary that stands in for one, mounted
 * beside PostHogProvider. That distinction matters for one specific reason:
 * app/layout.tsx must not read headers() or cookies(). 740475b did, to serve the
 * right `lang` in the first frame, and took the build from 79 static routes to 2
 * because reading a request in the ROOT layout opts in every route beneath it.
 * A client component child does not do that -- the layout stays static and this
 * runs in the browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * "CAPTURE MUST HAPPEN BEFORE ANY AUTH REDIRECT"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * That line in the spec is the reason this is a layout-level effect rather than
 * a page-level one. Several routes redirect a signed-out visitor to /auth, and
 * /storefront and /instructors redirect outright. A page-level capture on those
 * routes would run after the redirect had already replaced the URL, so the
 * parameters would be gone before anything read them.
 *
 * In the App Router, a layout's effects run before its children's, and this
 * component is above the routed subtree, so the read happens on the first commit
 * of the first render -- before any page effect has had the chance to navigate.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY IT READS window.location AND NOT useSearchParams
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * useSearchParams would be the idiomatic hook and it forces a Suspense boundary
 * on everything beneath it, which in the root layout is the entire app.
 * PostHogProvider already pays that cost for its pageview tracking and wraps
 * only its own tiny child to contain it. There is nothing to contain here: this
 * runs once per page load, reads the URL as it was when the document loaded, and
 * never re-reads. window.location is the simpler, cheaper and more accurate
 * source for that question.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIRE AND FORGET, AND NOTHING HERE MAY EVER SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Every branch is wrapped. A blocked localStorage, an ad blocker eating the
 * /api/attr request, a failed PostHog chunk: none of them may reach a visitor,
 * and none of them may stop the capture that already happened. The storage write
 * is what the pass form reads, so it comes FIRST and the two network-ish side
 * effects come after it.
 */

import { useEffect, useRef } from 'react';
import { captureAttribution, getSessionKey } from '@/lib/attribution';
import { setAttributionPersonProperties } from '@/lib/posthog';

export default function AttributionCapture() {
  // Once per mount, and a ref rather than an empty dep array alone: React 18
  // StrictMode runs effects twice in development, and a double-fired visit event
  // would inflate the exact denominator the Origen tab divides by. The database
  // also refuses it (attribution_events_one_visit_per_session), so this is the
  // cheap half of a guarantee that does not rely on the client.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    try {
      const { captured, visit, first, last } = captureAttribution(window.location.search, window.location.pathname);

      // An untagged navigation is the common case by a wide margin: one tagged
      // arrival and then every screen the person opens afterwards. Nothing below
      // should run for those, or the visit log becomes a pageview log and the
      // Origen tab's denominator stops meaning "people who arrived through this
      // channel".
      if (!captured) return;

      setAttributionPersonProperties(last, first);

      const sessionKey = getSessionKey();
      // No key means no deduplication, and an event that cannot be deduplicated
      // is worse than no event: it would be the one row that can be counted
      // twice. session_key is NOT NULL on the table for the same reason.
      if (!sessionKey) return;

      void fetch('/api/attr/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // keepalive so the request survives the navigation a tagged landing
        // usually leads to. A visit logged only when the person stays on the
        // page would undercount exactly the bounces that make a channel look
        // bad, which is the measurement worth having.
        keepalive: true,
        body: JSON.stringify({
          event_type: 'visit',
          session_key: sessionKey,
          src: visit.src,
          code: visit.code,
          ref: visit.ref,
          utm_source: visit.utm_source,
          utm_medium: visit.utm_medium,
          utm_campaign: visit.utm_campaign,
          utm_content: visit.utm_content,
          landing_path: visit.landing_path,
        }),
      }).catch(() => {
        // Expected often enough to be unremarkable: ad blockers block paths that
        // look like analytics, and this one does. The lead's own attribution does
        // not depend on this request -- it is in localStorage and in the URL --
        // so a blocked visit event costs a denominator, never a lead.
      });
    } catch {
      // captureAttribution does not throw by construction, and isTagged is pure.
      // This exists because the cost of being wrong about that is a white screen
      // on the root layout of every route in the app, and the cost of the branch
      // is one line.
    }
  }, []);

  return null;
}
