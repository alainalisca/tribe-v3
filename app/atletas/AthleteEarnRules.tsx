'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { intlLocale } from '@/lib/atletas/locale';
import type { AthleteMemberView } from '@/lib/atletas/athleteHomeView';

/**
 * "Lo que ganas" and "Reglas". The gym gives the rewards and pays the bonus
 * directly; Tribe never touches money (rule 6), so there is no total, only
 * the texts the gym wrote and, at athlete level, the per-join amount it set
 * (decision 2, 2026-09-30: a captain's joins never carry a bonus).
 *
 * The reward texts are the gym's own words in each language, stored on
 * athlete_programs; they are data, not copy, so they are picked by language
 * rather than translated.
 */

function formatCop(value: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

const GYM_TEXT: Record<string, 'Es' | 'En'> = { es: 'Es', en: 'En' };

export default function AthleteEarnRules({ view }: { view: AthleteMemberView }) {
  const { language } = useLanguage();
  const t = useTranslations('athleteHome');
  const r = view.rewards;
  const suffix = GYM_TEXT[language] ?? 'Es';
  const showup = r[`showup${suffix}`];
  const access = r[`classAccess${suffix}`];
  const bonusNote = r[`bonusNote${suffix}`];
  const gym = view.partnerName;

  return (
    <>
      <section className="rounded-2xl bg-theme-card p-5">
        <h2 className="text-lg font-bold text-theme-primary">{t('earnTitle')}</h2>
        {showup ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-theme-primary">{t('earnShowup')}</p>
            <p className="text-sm text-theme-secondary">{showup}</p>
          </div>
        ) : null}
        {access ? <p className="mt-2 text-sm text-theme-secondary">{access}</p> : null}
        {r.bonusCop !== null ? (
          <div className="mt-3" data-bonus>
            <p className="text-sm font-semibold text-theme-primary">{t('earnBonus')}</p>
            <p className="text-sm text-theme-secondary">{formatCop(r.bonusCop, language)}</p>
            {bonusNote ? <p className="text-xs text-theme-secondary">{bonusNote}</p> : null}
          </div>
        ) : null}
        <p className="mt-3 text-sm font-semibold text-theme-primary">{t('earnPaysDirect', { gym })}</p>
      </section>

      <section className="rounded-2xl bg-theme-card p-5">
        <h2 className="text-lg font-bold text-theme-primary">{t('rulesTitle')}</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-theme-secondary">
          <li>{t('rule1')}</li>
          <li>{t('rule2')}</li>
          <li>{t('rule3', { gym })}</li>
          <li>{t('rule4')}</li>
        </ol>
      </section>
    </>
  );
}
