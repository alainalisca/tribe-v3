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

  function handleReplay() {
    if (typeof window === 'undefined') return;
    try {
      for (const id of GUIDE_IDS) {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
      }
    } catch {
      // localStorage can throw in private browsing; we just fail
      // silently — the worst case is the user has to skip a tour
      // again on next visit, which is acceptable.
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
          onClick={handleReplay}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 text-xs font-bold rounded-full hover:bg-stone-200 dark:hover:bg-tribe-mid transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {s.label}
        </button>
      )}
    </div>
  );
}
