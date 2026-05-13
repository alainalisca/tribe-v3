/**
 * State management for the QuickGuide modal.
 *
 * Tracks "has this user seen this specific guide" in localStorage so
 * we can auto-show a tour on first visit but never spam an existing
 * user with it. Each guide has a stable string id; mark-as-seen is
 * scoped to that id.
 *
 * Usage:
 *
 *   const guide = useQuickGuide('tribe-os-welcome', {
 *     autoOpen: true,        // open on first visit when seen=false
 *     enabled: isPremium,    // only consider auto-opening if this is true
 *   });
 *
 *   return (
 *     <>
 *       <button onClick={guide.replay}>Take the tour</button>
 *       <QuickGuide
 *         id="tribe-os-welcome"
 *         open={guide.open}
 *         onClose={guide.close}
 *         steps={...}
 *       />
 *     </>
 *   );
 *
 * Why localStorage instead of a user-row flag: the seen-state is
 * device-local — a user on phone vs laptop expects to see the tour
 * once per device, not once globally. Also avoids round-tripping a
 * trivial UI preference to the database. If a multi-device sync
 * pattern becomes important later, switching the storage shim to
 * a user_preferences table doesn't change the API surface.
 */
import { useCallback, useEffect, useState } from 'react';

interface UseQuickGuideOptions {
  /**
   * If true, the guide auto-opens on first visit (when no seen flag
   * exists in localStorage). Defaults to true. Set false if you want
   * a manual-trigger-only guide (e.g. a help-button-launched tour).
   */
  autoOpen?: boolean;
  /**
   * Additional gate for auto-open. Common case: only auto-show the
   * Tribe.OS tour to PREMIUM users (we don't want to lecture non-
   * premium visitors who are just exploring). When this is false,
   * `markSeen` is still callable so the user can opt in via `replay`,
   * but auto-open is suppressed.
   */
  enabled?: boolean;
}

interface UseQuickGuideResult {
  /** Whether the guide should currently be rendered open. */
  open: boolean;
  /** Whether the seen flag is set (the auto-open trigger has fired). */
  seen: boolean;
  /** Close the guide. Marks it seen (sets the localStorage flag). */
  close: () => void;
  /**
   * Re-open the guide. Does not affect the seen flag — re-running the
   * tour shouldn't change the "have they been onboarded" answer.
   */
  replay: () => void;
}

const STORAGE_PREFIX = 'tribe_guide_seen_';

function storageKey(id: string): string {
  return `${STORAGE_PREFIX}${id}`;
}

function readSeen(id: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey(id)) === '1';
  } catch {
    // localStorage can throw in private browsing on some Safari
    // versions. Treat as "seen" so we never trap the user in an
    // infinite auto-open loop.
    return true;
  }
}

function writeSeen(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(id), '1');
  } catch {
    // Ignore. The next render will re-derive open=false because the
    // hook's local state has already flipped seen=true.
  }
}

export function useQuickGuide(id: string, options: UseQuickGuideOptions = {}): UseQuickGuideResult {
  const { autoOpen = true, enabled = true } = options;
  const [seen, setSeen] = useState(false);
  const [open, setOpen] = useState(false);

  // Initial read: localStorage is only available on the client, so we
  // can't seed useState from it. Read in an effect on mount.
  useEffect(() => {
    const initialSeen = readSeen(id);
    setSeen(initialSeen);
    if (!initialSeen && autoOpen && enabled) {
      setOpen(true);
    }
    // Intentionally only depends on id. autoOpen / enabled changes
    // after mount shouldn't re-trigger the modal — that would
    // re-open the tour every time a state ancestor flips, which is
    // not what the caller wants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const close = useCallback(() => {
    setOpen(false);
    setSeen(true);
    writeSeen(id);
  }, [id]);

  const replay = useCallback(() => {
    setOpen(true);
  }, []);

  return { open, seen, close, replay };
}
