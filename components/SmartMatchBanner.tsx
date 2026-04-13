/** Component: SmartMatchBanner — dismissible banner for pending smart matches */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchSmartMatches, updateMatchStatus, fetchTrainingPreferences } from '@/lib/dal/smartMatch';
import type { SmartMatchWithUser } from '@/lib/dal/smartMatch';
import { SPORTS_TRANSLATIONS, type Sport } from '@/lib/sports';
import { X, Sparkles, Settings } from 'lucide-react';
import Link from 'next/link';

interface Props {
  userId: string;
}

export default function SmartMatchBanner({ userId }: Props) {
  const supabase = createClient();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [matches, setMatches] = useState<SmartMatchWithUser[]>([]);
  const [hasPrefs, setHasPrefs] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadData() {
    const prefsResult = await fetchTrainingPreferences(supabase, userId);
    const prefsExist = prefsResult.success && prefsResult.data !== null;
    setHasPrefs(prefsExist);

    if (prefsExist) {
      const matchResult = await fetchSmartMatches(supabase, userId, 5);
      if (matchResult.success && matchResult.data) {
        setMatches(matchResult.data);
      }
    }
  }

  async function handleDismiss() {
    // Dismiss all pending matches
    for (const m of matches) {
      await updateMatchStatus(supabase, m.id, 'dismissed');
    }
    setDismissed(true);
  }

  // Loading state
  if (hasPrefs === null) return null;

  // Dismissed
  if (dismissed) return null;

  // No preferences set — prompt to set them
  if (!hasPrefs) {
    return (
      <div className="mx-4 mb-4 bg-gradient-to-r from-tribe-dark to-tribe-surface rounded-2xl p-4 border border-tribe-mid">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-tribe-green flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-white">
                {isEs
                  ? 'Configura tus preferencias de entrenamiento'
                  : 'Set your training preferences to find partners'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {isEs
                  ? 'Encuentra atletas cerca de ti con intereses similares'
                  : 'Find athletes near you with similar interests'}
              </p>
            </div>
          </div>
        </div>
        <Link href="/settings">
          <button className="mt-3 w-full py-2 rounded-xl bg-tribe-green text-slate-900 font-semibold text-sm hover:bg-tribe-green-hover transition">
            {isEs ? 'Configurar' : 'Set Up'}
          </button>
        </Link>
      </div>
    );
  }

  // No matches
  if (matches.length === 0) return null;

  // Compute display text
  const topSports = [...new Set(matches.flatMap((m) => m.shared_sports))].slice(0, 2);
  const sportNames = topSports.map((s) => {
    const translation = SPORTS_TRANSLATIONS[s as Sport];
    return translation ? translation[language] : s;
  });
  const sportsText = sportNames.join(isEs ? ' y ' : ' & ');

  return (
    <div className="mx-4 mb-4 bg-gradient-to-r from-tribe-dark to-tribe-surface rounded-2xl p-4 border border-tribe-mid">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-tribe-green flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-white">
              {isEs
                ? `Encontramos ${matches.length} atleta${matches.length > 1 ? 's' : ''} cerca de ti que entrena${matches.length > 1 ? 'n' : ''} ${sportsText}!`
                : `We found ${matches.length} athlete${matches.length > 1 ? 's' : ''} near you who train${matches.length === 1 ? 's' : ''} ${sportsText}!`}
            </p>
            {/* Show top match preview */}
            {matches[0]?.matched_user && (
              <p className="text-xs text-gray-400 mt-1">
                {matches[0].matched_user.name}
                {matches[0].distance_km != null && ` - ${matches[0].distance_km} km`}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 text-gray-500 hover:text-gray-300 transition"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <Link href="/smart-matches" className="flex-1">
          <button className="w-full py-2 rounded-xl bg-tribe-green text-slate-900 font-semibold text-sm hover:bg-tribe-green-hover transition">
            {isEs ? 'Ver coincidencias' : 'View Matches'}
          </button>
        </Link>
      </div>
    </div>
  );
}
