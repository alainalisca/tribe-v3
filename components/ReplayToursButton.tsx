'use client';

/**
 * "Replay tours" affordance for the Settings page.
 *
 * Clears the localStorage seen-flags for every QuickGuide so the
 * next time the user lands on a guide's host surface (the home
 * feed, /os/dashboard, /os/clients, /os/revenue, /os/coaches), the
 * tour auto-opens again.
 *
 * Why a button vs. a per-guide replay link: we'd otherwise need to
 * surface a separate "replay" link for each guide, which means
 * showing 5+ buttons in settings — most of which the user has no
 * context for. A single "replay all the welcome tours" button is
 * simpler and matches the user's mental model ("I want to see the
 * intro again").
 *
 * Keeps the list of guide IDs in sync with the actual guides — if
 * a new guide ships, add its ID to GUIDE_IDS below.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resetOnboardingState } from '@/lib/dal';
import { logError } from '@/lib/logger';
import { RotateCcw, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

// Update this list when adding a new QuickGuide. Each ID must match
// the one passed to useQuickGuide() inside the guide component.
const GUIDE_IDS = [
  'tribe-welcome',
  'tribe-os-welcome',
  'tribe-os-clients-welcome',
  'tribe-os-revenue-welcome',
  'tribe-os-coaches-welcome',
] as const;

const STORAGE_PREFIX = 'tribe_guide_seen_';
const BANNER_STORAGE_PREFIX = 'tribe_banner_dismissed_';

// Banner ids, matching hooks/useBannerDismissal.ts and the comment on
// users.dismissed_banners. Only their local mirrors are cleared here; the
// server array is emptied in one call.
const BANNER_IDS_TO_CLEAR = [
  'profile-completion',
  'streak',
  'referral',
  'instructor-upsell',
  'notification-prompt',
] as const;

// Onboarding checklist dismissal key — cleared here too so the user
// gets back the full "see everything again" experience. The
// checklist auto-graduates once items are done, so re-showing it
// after a real reset is safe.
const ONBOARDING_DISMISS_KEY = 'tribe_os_onboarding_dismissed_v1';

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    label: 'Replay welcome tours',
    hint: 'See the intro guides again the next time you visit each page.',
    success: 'Tours will reappear on your next visit to each page.',
  },
  es: {
    label: 'Ver de nuevo los tours de bienvenida',
    hint: 'Vuelve a ver las guías de introducción la próxima vez que visites cada página.',
    success: 'Los tours volverán a aparecer la próxima vez que visites cada página.',
  },
} as const;

export default function ReplayToursButton() {
  const { language } = useLanguage();
  const s = copy[language];
  const [cleared, setCleared] = useState(false);

  /**
   * T-ONB1: this is the reset path. First-run state is now on the user row, so
   * clearing the local mirrors alone would do nothing — the server would just
   * answer "seen" again on the next load. Both halves are cleared: the server
   * columns via resetOnboardingState, and the local mirrors so the current tab
   * does not keep answering from cache.
   */
  async function handleReplay() {
    if (typeof window !== 'undefined') {
      try {
        for (const id of GUIDE_IDS) {
          window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
        }
        for (const id of BANNER_IDS_TO_CLEAR) {
          window.localStorage.removeItem(`${BANNER_STORAGE_PREFIX}${id}`);
        }
        window.localStorage.removeItem(ONBOARDING_DISMISS_KEY);
      } catch {
        // localStorage can throw in private browsing. The server reset below
        // is the one that matters, so carry on.
      }
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const result = await resetOnboardingState(supabase, user.id);
      if (!result.success) {
        logError(new Error(result.error ?? 'reset_failed'), { action: 'ReplayToursButton' });
      }
    }

    setCleared(true);
  }

  return (
    <div className="bg-white dark:bg-tribe-card rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-2">
        <RotateCcw className="w-5 h-5 text-tribe-green" />
        <h2 className="text-lg font-bold text-theme-primary">{s.label}</h2>
      </div>
      <p className="text-sm text-theme-secondary mb-3 leading-relaxed">{s.hint}</p>
      {cleared ? (
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-tribe-green">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {s.success}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void handleReplay()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 text-xs font-bold rounded-full hover:bg-stone-200 dark:hover:bg-tribe-mid transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {s.label}
        </button>
      )}
    </div>
  );
}
