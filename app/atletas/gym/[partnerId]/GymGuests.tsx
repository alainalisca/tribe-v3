'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { formatShortDate } from '@/lib/atletas/locale';
import { setPassLeadContacted } from '@/lib/dal/leadContact';
import { markLeadBonusSettled, markLeadRetained } from '@/lib/dal/athleteGymWrites';
import { matchesGuestFilter, type GuestFilter, type GymGuestRow, type GymView } from '@/lib/atletas/gymView';
import DoorOutcomeButtons from '@/components/door/DoorOutcomeButtons';
import { useGymWrite } from './useGymWrite';

/**
 * T-AV26 "Invitados": the program's attributed guests from the summary, newest
 * first, with filter chips (all, expected, came, members). The chips select
 * rows by the summary's own fields and carry no counts, so nothing is counted
 * here (matchesGuestFilter).
 *
 * Owner and admin, per row:
 *   outcomes             DoorOutcomeButtons (av_athletes_set_outcome), shared
 *                        with the door, once the guest came
 *   "Oferta enviada"     set_pass_lead_contacted through setPassLeadContacted,
 *                        the existing writer (D13); a checkbox, so it can be
 *                        cleared again
 *   "Marcar como sigue"  for a join once retain_from has passed; before that,
 *                        "Disponible desde el {date}"
 *   "Bono pagado"        for a join that owes a bonus (eligible and credited)
 * A coach sees the rows and statuses only.
 */
interface GymGuestsProps {
  view: GymView;
}

const FILTERS: readonly GuestFilter[] = ['all', 'expected', 'came', 'members'];
const FILTER_KEY = {
  all: 'filterAll',
  expected: 'filterExpected',
  came: 'filterCame',
  members: 'filterMembers',
} as const;

type TH = ReturnType<typeof useTranslations>;

/** The row's status line: the no-credit reason wins, then the furthest step reached. */
function statusText(g: GymGuestRow, t: TH, th: TH, td: TH): string {
  if (!g.credited) {
    switch (g.noCreditReason) {
      case 'self_email':
        return t('reasonSelfEmail');
      case 'self_whatsapp':
        return t('reasonSelfWhatsapp');
      case 'duplicate':
        return t('reasonDuplicate');
      case 'returning':
        return t('reasonReturning');
      case 'already_member':
        return td('outcomeMember');
      default:
        return th('statusNoCredit');
    }
  }
  if (g.outcome === 'joined') return g.retainedAt ? th('statusStayed') : td('outcomeJoined');
  if (g.outcome === 'follow_up') return td('outcomeFollowUp');
  if (g.outcome === 'not_now') return td('outcomeNotNow');
  if (g.outcome === 'already_member') return td('outcomeMember');
  return g.attendedAt ? th('statusArrived') : th('statusClaimed');
}

function GuestRow({ g, canManage }: { g: GymGuestRow; canManage: boolean }) {
  const { language } = useLanguage();
  const router = useRouter();
  const t = useTranslations('gym');
  const th = useTranslations('athleteHome');
  const td = useTranslations('door');
  const { busy, error, run } = useGymWrite();
  const small =
    'rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-tribe-dark disabled:opacity-50';

  return (
    <li
      className="rounded-2xl bg-theme-card p-4"
      data-guest-row={g.passCode}
      data-outcome={g.outcome ?? ''}
      data-attended={g.attendedAt ? 'true' : 'false'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-theme-primary">{g.firstName}</p>
          <p className="text-xs text-theme-secondary">
            {formatShortDate(g.claimedAt, language)} · {td('invitedBy', { athlete: g.athleteFirstName })}
          </p>
        </div>
        <span
          data-guest-status
          className="flex-shrink-0 rounded-full bg-theme-page px-3 py-1 text-xs font-semibold text-theme-primary"
        >
          {statusText(g, t, th, td)}
        </span>
      </div>

      {canManage ? (
        <div className="mt-3 space-y-3">
          {g.attendedAt ? (
            <DoorOutcomeButtons passCode={g.passCode} initialOutcome={g.outcome} onSaved={() => router.refresh()} />
          ) : null}

          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-theme-primary">
            <input
              type="checkbox"
              checked={Boolean(g.contactedAt)}
              disabled={busy !== null}
              data-action="offer-sent"
              onChange={(e) => {
                const next = e.target.checked;
                void run('contacted', () => setPassLeadContacted(createClient(), g.leadId, next));
              }}
              className="h-5 w-5 accent-tribe-dark"
            />
            {t('offerSent')}
          </label>

          {g.outcome === 'joined' && !g.retainedAt ? (
            g.retainAvailable ? (
              <button
                type="button"
                data-action="retained"
                disabled={busy !== null}
                onClick={() => run('retained', () => markLeadRetained(createClient(), g.leadId))}
                className={small}
              >
                {t('guestMarkStayed')}
              </button>
            ) : g.retainFrom ? (
              <p data-retain-from={g.retainFrom} className="text-xs text-theme-secondary">
                {t('guestStayedFrom', { date: formatShortDate(g.retainFrom, language) })}
              </p>
            ) : null
          ) : null}

          {g.bonusSettledAt ? (
            <p data-bonus-settled className="text-xs font-semibold text-theme-primary">
              {t('guestBonusPaid')} · {formatShortDate(g.bonusSettledAt, language)}
            </p>
          ) : g.bonusOwed ? (
            <button
              type="button"
              data-action="bonus-paid"
              disabled={busy !== null}
              onClick={() => run('bonus', () => markLeadBonusSettled(createClient(), g.leadId))}
              className={small}
            >
              {t('guestBonusPaid')}
            </button>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {td('error')}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function GymGuests({ view }: GymGuestsProps) {
  const t = useTranslations('gym');
  const th = useTranslations('athleteHome');
  const [filter, setFilter] = useState<GuestFilter>('all');
  const rows = view.guests.filter((g) => matchesGuestFilter(g, filter));

  return (
    <section className="space-y-3" data-gym-guests>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            data-filter={f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'rounded-full bg-tribe-dark px-4 py-2 text-sm font-semibold text-white'
                : 'rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-tribe-dark'
            }
          >
            {t(FILTER_KEY[f])}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-theme-card p-4 text-sm text-theme-secondary">{th('guestsEmpty')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((g) => (
            <GuestRow key={g.leadId} g={g} canManage={view.canManage} />
          ))}
        </ul>
      )}
    </section>
  );
}
