'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AthleteMemberView } from '@/lib/atletas/athleteHomeView';
import { WhatsAppShareButton } from './AthleteLinkCard';

/**
 * "Mis números": the ledger's own counts (av_athletes_ledger_totals through
 * my_summary), so the athlete and the gym can never see different numbers.
 * Every count is over CREDITED leads (rule 3); "Siguen" is retained.
 */
export default function AthleteNumbers({ view }: { view: AthleteMemberView }) {
  const t = useTranslations('athleteHome');
  const tiles: Array<{ key: keyof AthleteMemberView['counts']; label: string }> = [
    { key: 'invited', label: t('numbersInvited') },
    { key: 'showedUp', label: t('numbersShowedUp') },
    { key: 'joined', label: t('numbersJoined') },
    { key: 'stayed', label: t('numbersStayed') },
  ];

  return (
    <section className="rounded-2xl bg-theme-card p-5">
      <h2 className="text-lg font-bold text-theme-primary">{t('numbersTitle')}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-xl bg-theme-inset p-3 text-center">
            <p data-metric={tile.key} className="text-3xl font-extrabold text-theme-primary">
              {view.counts[tile.key]}
            </p>
            <p className="mt-1 text-sm text-theme-secondary">{tile.label}</p>
          </div>
        ))}
      </div>
      {view.counts.invited === 0 ? (
        <div className="mt-4" data-numbers-zero>
          <p className="text-sm text-theme-secondary">{t('numbersZero')}</p>
          <WhatsAppShareButton view={view} className="mt-3" />
        </div>
      ) : null}
    </section>
  );
}
