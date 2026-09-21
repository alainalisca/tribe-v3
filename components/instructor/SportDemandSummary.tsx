'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchSportDemand, type SportDemand } from '@/lib/dal/demand';
import { sportTranslations } from '@/lib/translations';
import { logError } from '@/lib/logger';

/**
 * What an instructor sees about demand: which sports athletes do, in bands.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE IS STATED, AND THAT IS THE WHOLE POINT OF THE NOTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migration 186 omits any sport with fewer than 5 athletes, because a count of
 * 1 names a person. Measured on production the day it shipped: 9 sports shown,
 * ELEVEN suppressed. More than half the vocabulary is absent.
 *
 * Without the note, an instructor reads nine sports and concludes nobody does
 * the other fourteen. The truth is that 1-4 people do each of eleven of them.
 * "Nobody does Basketball" and "four people do Basketball" are different
 * decisions for someone choosing what to teach, and absence was being read as
 * zero.
 *
 * NO COUNT OF SUPPRESSED SPORTS. An earlier draft said "11 other sports have
 * fewer than 5 athletes each", on the reasoning that it added no inference
 * beyond what the reader could already derive. That reasoning was WRONG: with
 * 23 sports in the vocabulary and 9 shown, naming 11 as suppressed tells the
 * reader that 3 sports have NOBODY -- which they could not otherwise
 * distinguish from the suppressed set. Small, not identifying, and unnecessary,
 * because the rule alone fixes the misreading.
 *
 * ES copy is provisional and goes to Ana.
 */
interface Props {
  language: string;
}

export default function SportDemandSummary({ language }: Props) {
  const supabase = createClient();
  const isEs = language === 'es';

  const [demand, setDemand] = useState<SportDemand[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchSportDemand(supabase);
      if (cancelled) return;
      if (result.success && result.data) {
        setDemand(result.data);
      } else {
        // The RPC raises 42501 for a non-instructor, which is expected on a
        // surface that should never render for one. Logged rather than shown:
        // there is nothing an instructor can do about it, and a failed demand
        // read must not take the dashboard down.
        logError(new Error(result.error || 'fetchSportDemand failed'), {
          action: 'SportDemandSummary.load',
        });
        setDemand([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Self-hiding while loading and when there is nothing to say, rather than
  // rendering an empty card. A section that occupies space to say nothing is
  // how a dashboard becomes noise.
  if (loading || !demand || demand.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-tribe-mid dark:bg-tribe-surface">
      <h3 className="text-sm font-bold text-theme-primary">
        {isEs ? 'Qué entrenan los atletas' : 'What athletes train'}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {demand.map((d) => (
          <span
            key={d.sport}
            className="inline-flex items-center gap-1.5 rounded-full bg-tribe-green px-3 py-1 text-xs font-semibold text-tribe-dark"
          >
            {/* tribe-dark on tribe-green is 12.6:1. Green as small text on a
                light surface is 1.65:1 and fails AA; see CLAUDE.md. */}
            {sportTranslations[d.sport]?.[language as 'en' | 'es'] || d.sport}
            <span className="font-bold">{d.athletes}</span>
          </span>
        ))}
      </div>

      {/* THE NOTE. States the rule, not the number. */}
      <p className="mt-3 text-xs text-theme-tertiary">
        {isEs
          ? 'No se muestran los deportes con menos de 5 atletas.'
          : "Sports with fewer than 5 athletes aren't shown."}
      </p>
    </div>
  );
}
