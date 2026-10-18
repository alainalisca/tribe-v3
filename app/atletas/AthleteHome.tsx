'use client';

import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import UserAvatar from '@/components/UserAvatar';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { AthleteHomeView, AthleteMemberView } from '@/lib/atletas/athleteHomeView';
import AthleteLinkCard from './AthleteLinkCard';
import AthleteNumbers from './AthleteNumbers';
import AthletePath from './AthletePath';
import AthleteGuests from './AthleteGuests';
import AthleteEarnRules from './AthleteEarnRules';
import LevelLabel from './LevelLabel';

/**
 * /atletas/ (T-AV24), the client half. Everything here renders from the view
 * model the server built (lib/atletas/athleteHomeView.ts); nothing is fetched
 * from the browser. Copy: messages/*.json under "athleteHome" (recon 5.3, EN
 * approved 2026-09-30, ES as proposed; spec 7.2; Al's reason strings).
 *
 * The data-* attributes are for supabase/recon/t-av24-proof.LOCAL.sh: the
 * server renders the default language and the client switches after mount,
 * so the proof reads numbers from attributes, never from copy.
 */

interface AthleteHomeProps {
  view: AthleteHomeView;
}

function Shell({ children, state }: { children: React.ReactNode; state: string }) {
  const t = useTranslations('athleteHome');
  return (
    <div className="min-h-screen bg-theme-page pb-nav" data-athlete-state={state}>
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-lg font-bold text-theme-primary">{t('entryTitle')}</h1>
        </div>
      </div>
      <div className="pt-header max-w-2xl mx-auto px-4 pb-6 space-y-4">{children}</div>
      <BottomNav />
    </div>
  );
}

function NotInProgram() {
  const t = useTranslations('athleteHome');
  return (
    <Shell state="none">
      <section className="mt-4 rounded-2xl bg-tribe-dark p-6 text-center">
        <h2 className="text-xl font-extrabold text-white">{t('noneTitle')}</h2>
        <p className="mt-3 text-base font-semibold text-tribe-green">{t('emotional')}</p>
        <p className="mt-3 text-sm text-white/80">{t('noneBody')}</p>
        <p className="mt-5 inline-block rounded-full bg-tribe-green px-4 py-2 text-sm font-semibold text-tribe-dark">
          {t('noneCta')}
        </p>
      </section>
      <Link href="/" className="block text-center text-sm text-theme-secondary underline">
        Tribe
      </Link>
    </Shell>
  );
}

function Hero({ view }: { view: AthleteMemberView }) {
  const t = useTranslations('athleteHome');
  return (
    <section className="mt-4 flex items-center gap-4 rounded-2xl bg-tribe-dark p-5">
      {/* object-top keeps faces in frame */}
      <UserAvatar
        src={view.avatarUrl}
        name={view.firstName}
        alt=""
        className="h-20 w-20 bg-white/10 dark:bg-white/10 [&_img]:object-top"
        textClassName="text-2xl text-white dark:text-white"
      />
      <div className="min-w-0">
        {view.firstName ? <p className="truncate text-xl font-extrabold text-white">{view.firstName}</p> : null}
        <p className="mt-1 text-sm text-white/80">{t('atGym', { gym: view.partnerName })}</p>
        <span
          data-level={view.level}
          className="mt-2 inline-block rounded-full bg-tribe-green px-3 py-1 text-xs font-bold text-tribe-dark"
        >
          <LevelLabel level={view.level} />
        </span>
      </div>
    </section>
  );
}

export default function AthleteHome({ view }: AthleteHomeProps) {
  const t = useTranslations('athleteHome');
  if (view.state === 'none') return <NotInProgram />;
  return (
    <Shell state="member">
      <Hero view={view} />
      {/* Al, 2026-09-30: the emotional line for athletes in a program too. Small
          and secondary, not green: green fails AA as small text on a light page. */}
      <p data-emotional className="px-2 text-center text-xs text-theme-secondary">
        {t('emotional')}
      </p>
      <AthleteLinkCard view={view} />
      <AthleteNumbers view={view} />
      <AthletePath view={view} />
      <AthleteGuests view={view} />
      <AthleteEarnRules view={view} />
    </Shell>
  );
}
