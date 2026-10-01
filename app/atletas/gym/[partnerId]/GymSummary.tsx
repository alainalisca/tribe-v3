'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import type { GymView } from '@/lib/atletas/gymView';

/**
 * T-AV26 "Resumen": the funnel Invitados, Llegaron, Se inscribieron, Siguen,
 * each with its rate, then "Por cerrar". Owner and admin also see bonuses owed
 * and paid, as COUNTS (spec rule 5.6: never a money total). Every number is a
 * field of av_athletes_partner_summary's totals; the rates divide two of them
 * (gymView.rate). The data-* attributes carry the raw numbers for the proof.
 */
interface GymSummaryProps {
  view: GymView;
}

interface Stage {
  key: string;
  label: string;
  value: number;
  rate: string | null;
}

export default function GymSummary({ view }: GymSummaryProps) {
  const t = useTranslations('gym');
  const th = useTranslations('athleteHome');
  const f = view.funnel;
  const stages: Stage[] = [
    { key: 'invited', label: th('numbersInvited'), value: f.invited, rate: null },
    {
      key: 'showed_up',
      label: th('numbersShowedUp'),
      value: f.showedUp,
      rate: f.rateShowedUp === null ? null : t('rateShowedUp', { n: f.rateShowedUp }),
    },
    {
      key: 'joined',
      label: th('numbersJoined'),
      value: f.joined,
      rate: f.rateJoined === null ? null : t('rateJoined', { n: f.rateJoined }),
    },
    {
      key: 'retained',
      label: th('numbersStayed'),
      value: f.retained,
      rate: f.rateStayed === null ? null : t('rateStayed', { n: f.rateStayed }),
    },
  ];

  return (
    <section className="space-y-3" data-gym-summary>
      <ol className="space-y-2">
        {stages.map((s) => (
          <li
            key={s.key}
            data-funnel={s.key}
            data-value={s.value}
            className="flex items-center justify-between rounded-2xl bg-theme-card px-5 py-4"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-theme-primary">{s.label}</span>
              {s.rate ? <span className="block text-xs text-theme-secondary">{s.rate}</span> : null}
            </span>
            <span className="text-2xl font-extrabold text-theme-primary">{s.value}</span>
          </li>
        ))}
      </ol>

      <div
        data-funnel="to_close"
        data-value={f.toClose}
        className="flex items-center justify-between rounded-2xl bg-tribe-dark px-5 py-4"
      >
        <span className="text-sm font-semibold text-white">{t('toClose')}</span>
        <span className="text-2xl font-extrabold text-tribe-green">{f.toClose}</span>
      </div>

      {view.canManage ? (
        <div className="grid grid-cols-2 gap-2">
          <div data-funnel="bonus_owed" data-value={f.bonusOwed} className="rounded-2xl bg-theme-card px-4 py-3">
            <p className="text-xs text-theme-secondary">{t('colOwed')}</p>
            <p className="text-xl font-extrabold text-theme-primary">{f.bonusOwed}</p>
          </div>
          <div data-funnel="bonus_paid" data-value={f.bonusPaid} className="rounded-2xl bg-theme-card px-4 py-3">
            <p className="text-xs text-theme-secondary">{t('colPaid')}</p>
            <p className="text-xl font-extrabold text-theme-primary">{f.bonusPaid}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
