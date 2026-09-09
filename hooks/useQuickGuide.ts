'use client';

/**
 * State management for the QuickGuide modal.
 *
 * Tracks "has this athlete seen this specific guide". Each guide has a stable
 * string id; mark-as-seen is scoped to that id.
 *
 * WHERE THE ANSWER LIVES (changed in T-ONB1):
 * The server is authoritative — `users.dismissed_banners` carries the ids the
 * athlete has dismissed, so the answer follows the person across devices and
 * survives a cache clear. It previously lived only in localStorage, which is
 * per-device and per-browser, so the same athlete was re-onboarded on their
 * laptop, inside the Capacitor shell, in the WhatsApp in-app browser, and
 * after clearing site data.
 *
 * localStorage is kept as an optimistic mirror, not as the source of truth:
 * the flag is written locally the instant the athlete dismisses and to the
 * server in the same action, and on load the guide is suppressed if EITHER
 * says seen. A failed network write therefore cannot resurrect the tour on the
 * next load, while the server still settles the cross-device answer.
 *
 * THE MIRROR KEY IS SCOPED TO THE USER. It carried only the guide id at first,
 * which meant one account dismissing the tour hid it from every other account
 * on that device — including brand new ones, whose server state correctly said
 * "never seen". Worse, every browser that had used the old build already had
 * that un-scoped key set, so the introduction was suppressed for everyone,
 * everywhere, and the server was never even consulted. Legacy un-scoped keys
 * are now simply never read.
 *
 * UNKNOWN MEANS RENDER NOTHING. While the server answer is in flight the guide
 * stays closed. It used to auto-open during that gap — the guide mounted as
 * soon as `user` existed, before the profile had loaded — which is why an
 * athlete saw the tour, then the onboarding modal, then the tour again when
 * the modal closed and the component remounted. A brief absence is always
 * better than a wrongly repeated modal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { dismissBanner, fetchOnboardingState } from '@/lib/dal';
import { logError } from '@/lib/logger';

interface UseQuickGuideOptions {
  /**
   * If true, the guide auto-opens the first time this athlete sees it.
   * Defaults to true. Set false for a manual-trigger-only guide.
   */
  autoOpen?: boolean;
  /**
   * Additional gate for auto-open. Common case: only auto-show the Tribe.OS
   * tour to premium users. When false, auto-open is suppressed but `replay`
   * still works.
   */
  enabled?: boolean;
}

interface UseQuickGuideResult {
  /** Whether the guide should currently be rendered open. */
  open: boolean;
  /** Whether this guide is known to have been seen. False while unknown. */
  seen: boolean;
  /** True until the answer is known. Callers render nothing meanwhile. */
  loading: boolean;
  /** Close the guide and record it as seen, locally and on the server. */
  close: () => void;
  /**
   * Re-open the guide. Does not clear the seen flag — re-running a tour
   * shouldn't change the "have they been onboarded" answer.
   */
  replay: () => void;
}

const STORAGE_PREFIX = 'tribe_guide_seen_';

/** Per-user, so one account's dismissal cannot hide a guide from another. */
export function guideStorageKey(id: string, userId: string): string {
  return `${STORAGE_PREFIX}${userId}_${id}`;
}

/** Optimistic mirror read. Never the only answer, so a miss is harmless. */
function readLocalSeen(id: string, userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(guideStorageKey(id, userId)) === '1';
  } catch {
    // localStorage throws in private-mode Safari. Fall through to the server.
    return false;
  }
}

function writeLocalSeen(id: string, userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(guideStorageKey(id, userId), '1');
  } catch {
    // Ignore: the server write is the durable one and local state has already
    // flipped, so this render is correct either way.
  }
}

export function useQuickGuide(id: string, options: UseQuickGuideOptions = {}): UseQuickGuideResult {
  const { autoOpen = true, enabled = true } = options;
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // Guards the auto-open so it fires at most once per mount.
  const decided = useRef(false);
  // Captured once resolved, so close() can write the user-scoped mirror key.
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (!user) {
        // Signed out: no row to read and nothing to auto-open against.
        setLoading(false);
        return;
      }
      userIdRef.current = user.id;

      // The mirror is checked only once the user is known, because the key is
      // scoped to them. When it says "seen" it can only have been written by
      // this athlete dismissing this guide, so it is trusted and the network
      // read is skipped.
      if (readLocalSeen(id, user.id)) {
        setSeen(true);
        setLoading(false);
        decided.current = true;
        return;
      }

      const result = await fetchOnboardingState(supabase, user.id);
      if (cancelled) return;

      if (!result.success || !result.data) {
        // Unknown, not "unseen". Leave the guide closed rather than risk
        // showing it again to someone who already dismissed it.
        setLoading(false);
        return;
      }

      const alreadySeen = result.data.dismissedBanners.includes(id);
      setSeen(alreadySeen);
      setLoading(false);

      if (!alreadySeen && autoOpen && enabled && !decided.current) {
        decided.current = true;
        setOpen(true);
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
    // Only `id`: autoOpen/enabled flipping after mount must not re-trigger the
    // modal, which is part of what made the tour reappear mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = useCallback(() => {
    setOpen(false);
    setSeen(true);
    // Optimistic local write first, so a failed network call cannot resurrect
    // the tour on the next load. Only possible once the user is known; if the
    // answer never resolved there is nothing to mirror and the server write
    // below is the whole story.
    if (userIdRef.current) writeLocalSeen(id, userIdRef.current);

    void (async () => {
      const supabase = createClient();
      const result = await dismissBanner(supabase, id);
      if (!result.success) {
        logError(new Error(result.error ?? 'dismiss_failed'), { action: 'useQuickGuide.close', guideId: id });
      }
    })();
  }, [id]);

  const replay = useCallback(() => {
    setOpen(true);
  }, []);

  return { open, seen, loading, close, replay };
}
