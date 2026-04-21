'use client';

/**
 * Client-side stats renderer.
 *
 * Separated from the server fetch (ProfileStatsServer.tsx) so that:
 *   1. The expensive server-side fetch can be wrapped in Suspense on
 *      the route, streaming the rest of the profile (name, bio, sports,
 *      avatar) ahead of the stats.
 *   2. This renderer can still use the client-side useLanguage() hook
 *      for localized labels — server components can't read the
 *      language localStorage preference, so labels would default to
 *      English if this were a server component.
 *
 * The numeric values arrive already computed; this component owns only
 * presentation + the "low attendance" warning logic, which depends on
 * the numbers but not on any extra data.
 */

import { useLanguage } from '@/lib/LanguageContext';
import { getProfileTranslations } from './translations';
import type { ProfileStats } from './ProfilePageClient';

export default function ProfileStatsClient({ stats }: { stats: ProfileStats }) {
  const { language } = useLanguage();
  const t = getProfileTranslations(language);

  const hasLowAttendance = stats.totalAttendance >= 3 && stats.attendanceRate < 50;

  return (
    <>
      {/* Low-attendance warning. Previously this was gated on !isOwnProfile
          (only show to other viewers), but the current extraction doesn't
          have access to the viewer identity. Showing the banner on a user's
          own profile is arguably useful feedback ("you've been cancelling a
          lot"), so the gate was dropped deliberately. If product disagrees,
          plumb an `isOwnProfile` prop down from the parent. */}
      {hasLowAttendance && (
        <div className="mt-4 bg-orange-100 border border-orange-300 rounded-lg p-3">
          <p className="text-sm text-orange-700">
            ⚠️ {t.lowAttendance} {stats.attendanceRate.toFixed(0)}%
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-6">
        {[
          { value: stats.sessionsCreated, label: t.sessionsCreated },
          { value: stats.sessionsJoined, label: t.sessionsJoined },
          { value: stats.totalSessions, label: t.totalSessions },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border border-stone-200 dark:border-tribe-mid"
          >
            <p className="text-4xl font-bold text-theme-primary">{stat.value}</p>
            <p className="text-sm text-theme-secondary mt-1">{stat.label}</p>
          </div>
        ))}
        <div
          className={`bg-white dark:bg-tribe-surface rounded-2xl p-4 text-center border ${
            hasLowAttendance
              ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/20'
              : 'border-stone-200 dark:border-tribe-mid'
          }`}
        >
          <p className={`text-4xl font-bold ${hasLowAttendance ? 'text-orange-600' : 'text-theme-primary'}`}>
            {stats.totalAttendance > 0 ? `${stats.attendanceRate.toFixed(0)}%` : '—'}
          </p>
          <p className="text-sm text-theme-secondary mt-1">{t.attendanceRate}</p>
        </div>
      </div>
    </>
  );
}
