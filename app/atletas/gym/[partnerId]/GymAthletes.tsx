'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { setProgramAthleteLevel, setProgramAthleteStatus } from '@/lib/dal/athleteGymWrites';
import type { AthleteStatus } from '@/lib/dal/athleteGym';
import type { GymAthleteRow, GymView } from '@/lib/atletas/gymView';
import LevelLabel from '../../LevelLabel';
import GymAddAthlete from './GymAddAthlete';
import { useGymWrite } from './useGymWrite';

/**
 * T-AV26 "Atletas": level, status and the four counts per athlete, straight
 * from the summary's athlete rows. Owner and admin also see bonuses owed and
 * paid (counts), and the actions:
 *
 *   "Listo para subir" + Promote   only for a captain the counting function
 *                                  marks ready (D10: the app suggests, the
 *                                  gym confirms). The function itself lets an
 *                                  owner set any level but sponsored.
 *   Change level                   an athlete back to captain. Promoting a
 *                                  captain is only ever the Promote button.
 *   Pause / Resume / End           av_athletes_set_status; resuming refuses
 *                                  over the cap (program_full), worded.
 *
 * A coach sees the same rows and no button.
 */
interface GymAthletesProps {
  view: GymView;
}

const STATUS_KEY = { active: 'statusActive', paused: 'statusPaused', ended: 'statusEnded' } as const;

function AthleteRow({ a, canManage, maxAthletes }: { a: GymAthleteRow; canManage: boolean; maxAthletes: number }) {
  const t = useTranslations('gym');
  const th = useTranslations('athleteHome');
  const td = useTranslations('door');
  const { busy, error, run } = useGymWrite();

  const status = (next: AthleteStatus) =>
    run(`status:${next}`, () => setProgramAthleteStatus(createClient(), a.id, next));

  const button =
    'rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-tribe-dark disabled:opacity-50';

  return (
    <li
      className="rounded-2xl bg-theme-card p-4"
      data-athlete-row={a.id}
      data-level={a.level}
      data-status={a.status}
      data-ready={a.readyToPromote}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-theme-primary">{a.firstName}</p>
          <p className="text-xs text-theme-secondary">
            <LevelLabel level={a.level} /> · {t(STATUS_KEY[a.status])}
          </p>
        </div>
        {a.readyToPromote && a.level === 'captain' ? (
          <span
            data-ready-badge
            className="flex-shrink-0 rounded-full bg-tribe-green px-3 py-1 text-xs font-bold text-tribe-dark"
          >
            {t('ready')}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {(
          [
            ['invited', th('numbersInvited'), a.invited],
            ['showed_up', th('numbersShowedUp'), a.showedUp],
            ['joined', th('numbersJoined'), a.joined],
            ['retained', th('numbersStayed'), a.retained],
          ] as const
        ).map(([key, label, value]) => (
          <div key={key} data-count={key} data-value={value}>
            <dd className="text-lg font-extrabold text-theme-primary">{value}</dd>
            <dt className="text-[11px] text-theme-secondary">{label}</dt>
          </div>
        ))}
      </dl>

      {canManage ? (
        <>
          <p className="mt-2 text-xs text-theme-secondary" data-bonus-owed={a.bonusOwed} data-bonus-paid={a.bonusPaid}>
            {t('colOwed')}: {a.bonusOwed} · {t('colPaid')}: {a.bonusPaid}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {a.readyToPromote && a.level === 'captain' ? (
              <button
                type="button"
                data-action="promote"
                disabled={busy !== null}
                onClick={() => run('promote', () => setProgramAthleteLevel(createClient(), a.id, 'athlete'))}
                className="rounded-xl bg-tribe-green px-3 py-2 text-sm font-bold text-tribe-dark disabled:opacity-50"
              >
                {t('promote')}
              </button>
            ) : null}
            {a.level === 'athlete' ? (
              <button
                type="button"
                data-action="level"
                disabled={busy !== null}
                onClick={() => run('level', () => setProgramAthleteLevel(createClient(), a.id, 'captain'))}
                className={button}
              >
                {t('actionLevel')}
              </button>
            ) : null}
            {a.status === 'active' ? (
              <button
                type="button"
                data-action="pause"
                disabled={busy !== null}
                onClick={() => status('paused')}
                className={button}
              >
                {t('actionPause')}
              </button>
            ) : (
              <button
                type="button"
                data-action="resume"
                disabled={busy !== null}
                onClick={() => status('active')}
                className={button}
              >
                {t('actionResume')}
              </button>
            )}
            {a.status !== 'ended' ? (
              <button
                type="button"
                data-action="end"
                disabled={busy !== null}
                onClick={() => status('ended')}
                className={button}
              >
                {t('actionEnd')}
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error.code === 'program_full' ? t('addCap', { n: maxAthletes }) : td('error')}
            </p>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export default function GymAthletes({ view }: GymAthletesProps) {
  return (
    <section className="space-y-3" data-gym-athletes>
      {view.canManage ? <GymAddAthlete partnerId={view.partnerId} maxAthletes={view.maxAthletes} /> : null}
      <ul className="space-y-3">
        {view.athletes.map((a) => (
          <AthleteRow key={a.id} a={a} canManage={view.canManage} maxAthletes={view.maxAthletes} />
        ))}
      </ul>
    </section>
  );
}
