'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { SPORTS_LIST, getSportTranslation } from '@/lib/sports';
import { completeAthleteSetup } from '@/lib/dal/athleteSetup';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { sanitizeReturnTo, decodeReturnToParam } from '@/lib/pendingReturnTo';
import AvatarUploadField from '@/components/onboarding/AvatarUploadField';

/**
 * The one screen an athlete sees between choosing their role and landing in
 * the app. One required question: which sports.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There was no athlete onboarding at all. The role page sent an athlete
 * straight to /profile/edit, a free-form form where every field is optional,
 * so sports were never ASKED FOR -- not optional-within-a-wizard, never asked.
 *
 * Measured on 60 live athletes: 28 had neither sports nor photo. An athlete
 * with no sports is invisible to find_training_partners, contributes nothing
 * to sport_demand_counts, and cannot match in the smart-match cron. Nearly
 * half the athlete population did not exist to any discovery surface.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPORTS REQUIRED, PHOTO SKIPPABLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sports decides whether an athlete APPEARS anywhere. Photo decides whether
 * the appearance works. Forcing a photo at sign-up costs accounts; forcing one
 * sport costs three taps, and without it the account is invisible.
 *
 * The disabled Continue button below is a COURTESY. The requirement is
 * complete_athlete_setup (migration 187), which raises on an empty list --
 * because a rule enforced only by a greyed-out button is the same shape as
 * checking an invite's recipient in the read path and not the write.
 *
 * ES copy is provisional and goes to Ana.
 */
function AthleteSportsStepInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const isEs = language === 'es';

  // 'Other' is excluded, matching the instructor wizard: it is a real value in
  // SPORTS_LIST but it matches nothing in discovery, so offering it here would
  // let someone satisfy a requirement that exists to make them findable
  // without becoming findable.
  const choices = SPORTS_LIST.filter((s) => s !== 'Other');

  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (sport: string) =>
    setSelected((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]));

  // Where to go once sports are saved. The deferred ask (a share-link athlete
  // asked right after joining) passes the session they came for, so they land
  // back on it rather than on the feed. Validated with the SAME rule as every
  // other returnTo in the app -- a second copy of that rule is the one that
  // would miss "/\\evil.com".
  const returnTo = sanitizeReturnTo(decodeReturnToParam(searchParams.get('returnTo'))) ?? '/';

  const onContinue = async () => {
    setSaving(true);
    const result = await completeAthleteSetup(supabase, selected);
    if (result.success) {
      router.replace(returnTo);
      return;
    }
    // The real reason, not a generic one. The RPC's message names why a sport
    // is required, and a caller that swallowed it would leave the user staring
    // at a button that did nothing.
    logError(new Error(result.error ?? 'completeAthleteSetup failed'), {
      action: 'AthleteSportsStep.continue',
    });
    showError(result.error ?? (isEs ? 'No se pudo guardar' : 'Could not save'));
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-theme-page px-5 py-8 pb-nav">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold text-theme-primary">{isEs ? '¿Qué entrenas?' : 'What do you train?'}</h1>
        <p className="mt-2 text-sm text-theme-secondary">
          {isEs
            ? 'Elige al menos uno. Así encontramos gente que entrena lo mismo que tú.'
            : 'Pick at least one. This is how we find people who train what you train.'}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {choices.map((sport) => {
            const on = selected.includes(sport);
            return (
              <button
                key={sport}
                type="button"
                onClick={() => toggle(sport)}
                aria-pressed={on}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  on
                    ? 'bg-tribe-green text-tribe-dark'
                    : 'border border-stone-300 text-theme-secondary dark:border-tribe-mid'
                }`}
              >
                {getSportTranslation(sport, language)}
              </button>
            );
          })}
        </div>

        {/* Photo, on the same screen and skippable. Uploading is handled by the
            existing avatar path; leaving it empty is a valid outcome and the
            Continue button does not depend on it. */}
        <div className="mt-8">
          <h2 className="text-sm font-bold text-theme-primary">
            {isEs ? 'Añade una foto' : 'Add a photo'}
            <span className="ml-2 font-normal text-theme-tertiary">{isEs ? '(opcional)' : '(optional)'}</span>
          </h2>
          <p className="mt-1 text-xs text-theme-tertiary">
            {isEs
              ? 'Las personas responden más a un perfil con foto. Puedes añadirla después.'
              : 'People reply more often to a profile with a photo. You can add it later.'}
          </p>
          <div className="mt-3">
            <AvatarUploadField language={language} />
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={selected.length === 0 || saving}
          className="mt-8 w-full rounded-full bg-tribe-green px-5 py-3 text-sm font-bold text-tribe-dark transition disabled:opacity-40"
        >
          {saving ? (isEs ? 'Guardando…' : 'Saving…') : isEs ? 'Continuar' : 'Continue'}
        </button>

        {selected.length === 0 && (
          <p className="mt-2 text-center text-xs text-theme-tertiary">
            {isEs ? 'Elige al menos un deporte para continuar.' : 'Pick at least one sport to continue.'}
          </p>
        )}
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary or the route cannot prerender --
// the same wrapper /messages uses. The fallback is a blank screen of the right
// colour rather than a spinner: this renders for one frame on an already-
// navigated page, and a flashing spinner reads as an error.
export default function AthleteSportsStep() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-theme-base" />}>
      <AthleteSportsStepInner />
    </Suspense>
  );
}
