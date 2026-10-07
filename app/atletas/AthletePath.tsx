'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AthleteMemberView } from '@/lib/atletas/athleteHomeView';
import LevelLabel from './LevelLabel';

/**
 * "Tu camino": the three rungs (spec section 4). The app suggests, the gym
 * confirms (D10): at the threshold a captain sees "Listo", and nothing
 * changes until the owner or an admin promotes. Sponsored is "Próximamente".
 */
const RUNGS: Array<AthleteMemberView['level']> = ['captain', 'athlete', 'sponsored'];

export default function AthletePath({ view }: { view: AthleteMemberView }) {
  const t = useTranslations('athleteHome');
  const { showups, promoteAt } = view.progress;
  const pct = promoteAt > 0 ? Math.min(100, Math.round((showups / promoteAt) * 100)) : 0;

  return (
    <section className="rounded-2xl bg-theme-card p-5">
      <h2 className="text-lg font-bold text-theme-primary">{t('pathTitle')}</h2>
      <ol className="mt-3 flex gap-2">
        {RUNGS.map((level) => (
          <li
            key={level}
            data-rung={level}
            data-current={level === view.level ? 'true' : undefined}
            className={
              level === view.level
                ? 'flex-1 rounded-lg bg-tribe-green px-2 py-2 text-center text-xs font-bold text-tribe-dark'
                : 'flex-1 rounded-lg bg-theme-inset px-2 py-2 text-center text-xs font-semibold text-theme-secondary'
            }
          >
            <LevelLabel level={level} />
          </li>
        ))}
      </ol>
      {view.level === 'captain' ? (
        <div
          className="mt-4"
          data-progress={`${showups}/${promoteAt}`}
          data-ready={view.readyToPromote ? 'true' : 'false'}
        >
          <div className="h-3 w-full overflow-hidden rounded-full bg-theme-inset">
            <div className="h-full rounded-full bg-tribe-green" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-theme-secondary">{t('pathProgress', { n: showups, total: promoteAt })}</p>
          {view.readyToPromote ? (
            <p className="mt-2 rounded-lg bg-tribe-green px-3 py-2 text-sm font-semibold text-tribe-dark">
              {t('pathReady')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
