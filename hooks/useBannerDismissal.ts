'use client';

/**
 * "Has this athlete dismissed this banner, for good?" (T-ONB1)
 *
 * Same contract as useQuickGuide, for the non-modal surfaces: the server is
 * authoritative via `users.dismissed_banners`, localStorage is an optimistic
 * mirror, and unknown means render nothing.
 *
 * Dismissal state used to live only in localStorage, in a different key shape
 * per banner — and NotificationPrompt's key was not even per-user, so one
 * person dismissing it hid it from everyone else sharing that device.
 */
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { dismissBanner, fetchOnboardingState } from '@/lib/dal';
import { logError } from '@/lib/logger';

const STORAGE_PREFIX = 'tribe_banner_dismissed_';

const key = (bannerId: string) => `${STORAGE_PREFIX}${bannerId}`;

function readLocal(bannerId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key(bannerId)) === '1';
  } catch {
    return false;
  }
}

function writeLocal(bannerId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key(bannerId), '1');
  } catch {
    // Ignore: the server write is the durable one.
  }
}

interface UseBannerDismissalResult {
  /** True once this banner is known to be dismissed. */
  dismissed: boolean;
  /** True until the answer is known. Render nothing while this is true. */
  loading: boolean;
  /** Dismiss for good: local mirror first, then the atomic server append. */
  dismiss: () => void;
}

export function useBannerDismissal(bannerId: string): UseBannerDismissalResult {
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (readLocal(bannerId)) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    async function resolve() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoading(false);
        return;
      }

      const result = await fetchOnboardingState(supabase, user.id);
      if (cancelled) return;

      // A failure is "unknown", not "not dismissed". Staying hidden is the
      // safe direction: a missing banner is better than one that returns
      // after the athlete dismissed it.
      if (!result.success || !result.data) {
        setDismissed(true);
        setLoading(false);
        return;
      }

      setDismissed(result.data.dismissedBanners.includes(bannerId));
      setLoading(false);
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [bannerId]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeLocal(bannerId);

    void (async () => {
      const supabase = createClient();
      const result = await dismissBanner(supabase, bannerId);
      if (!result.success) {
        logError(new Error(result.error ?? 'dismiss_failed'), { action: 'useBannerDismissal', bannerId });
      }
    })();
  }, [bannerId]);

  return { dismissed, loading, dismiss };
}

/** Stable ids. Must match the values documented on users.dismissed_banners. */
export const BANNER_IDS = {
  profileCompletion: 'profile-completion',
  streak: 'streak',
  referral: 'referral',
  instructorUpsell: 'instructor-upsell',
  notificationPrompt: 'notification-prompt',
} as const;
