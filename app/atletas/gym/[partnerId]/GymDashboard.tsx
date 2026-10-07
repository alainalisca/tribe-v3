'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DoorOpen, Settings } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { GymView } from '@/lib/atletas/gymView';
import GymSummary from './GymSummary';
import GymAthletes from './GymAthletes';
import GymGuests from './GymGuests';

/**
 * /atletas/gym/[partnerId]/ (T-AV26), the client half. Renders only from the
 * view the server built (lib/atletas/gymView.ts). Writes go through the DAL on
 * the user's client and then re-read the summary (useGymWrite), so no number
 * here is ever computed or patched in the browser.
 *
 * Owner and admin (`view.canManage`): every action, the bonus counts, the
 * settings link and the money note. An active coach: the same tabs read-only,
 * and the door-list link. Copy: messages/*.json under "gym" (recon 5.4, spec
 * 7.2, Al's decision 4).
 */
type Tab = 'summary' | 'athletes' | 'guests';
const TABS: readonly Tab[] = ['summary', 'athletes', 'guests'];
const TAB_KEY = { summary: 'tabSummary', athletes: 'tabAthletes', guests: 'tabGuests' } as const;

interface GymDashboardProps {
  view: GymView;
}

export default function GymDashboard({ view }: GymDashboardProps) {
  const t = useTranslations('gym');
  const [tab, setTab] = useState<Tab>('summary');
  const base = `/atletas/gym/${view.partnerId}`;

  return (
    <div className="min-h-screen bg-theme-page pb-nav" data-gym-role={view.role} data-can-manage={view.canManage}>
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <h1 className="text-lg font-bold text-theme-primary">{t('title')}</h1>
          {view.canManage ? (
            <Link
              href={`${base}/ajustes/`}
              data-settings-link
              className="flex min-h-[44px] items-center gap-1 text-sm font-semibold text-theme-primary"
            >
              <Settings className="h-5 w-5" aria-hidden="true" />
              {t('tabSettings')}
            </Link>
          ) : null}
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto px-4 pb-6 space-y-4">
        <Link
          href={`${base}/puerta/`}
          data-door-link
          className="mt-4 flex items-center gap-3 rounded-2xl bg-tribe-dark px-5 py-4 text-base font-semibold text-white"
        >
          <DoorOpen className="h-5 w-5 text-tribe-green" aria-hidden="true" />
          {t('doorLink')}
        </Link>

        <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-theme-card p-1">
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-tab={key}
              onClick={() => setTab(key)}
              className={
                tab === key
                  ? 'rounded-xl bg-tribe-green px-2 py-2 text-sm font-bold text-tribe-dark'
                  : 'rounded-xl px-2 py-2 text-sm font-semibold text-theme-secondary'
              }
            >
              {t(TAB_KEY[key])}
            </button>
          ))}
        </div>

        <div role="tabpanel">
          {tab === 'summary' ? <GymSummary view={view} /> : null}
          {tab === 'athletes' ? <GymAthletes view={view} /> : null}
          {tab === 'guests' ? <GymGuests view={view} /> : null}
        </div>

        {view.canManage ? (
          <p data-money-note className="px-2 text-center text-xs text-theme-secondary">
            {t('money')}
          </p>
        ) : null}
      </div>
      <BottomNav />
    </div>
  );
}
