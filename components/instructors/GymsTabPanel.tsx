'use client';

/**
 * The "Gimnasios y estudios" side of Discover.
 *
 * Reuses GymsAndStudiosSection for the cards (one card design for gyms, wherever
 * they appear) and adds what a standalone list needs that a footer section did
 * not: a search box, and three distinct empty screens.
 *
 * THREE STATES, SAME RULE AS THE INSTRUCTOR SIDE (emptyStates.test.tsx): a
 * failed load, an empty directory and a search with no match are different
 * situations and get different screens. Before this panel existed, `gymsFailed`
 * reached the client and was never read: a failed gym fetch rendered as no
 * section at all, indistinguishable from "there are no gyms".
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import GymsAndStudiosSection from '@/components/instructors/GymsAndStudiosSection';
import { filterGyms } from '@/lib/discover/discoverTab';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface Props {
  gyms: GymDirectoryEntry[];
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
}

export default function GymsTabPanel({ gyms, failed, retrying, onRetry }: Props) {
  const t = useTranslations('discover');
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterGyms(gyms, query), [gyms, query]);

  let body: React.ReactNode;
  if (failed) {
    body = (
      <EmptyState emoji="⚠️" title={t('gymsLoadFailed')} desc={t('gymsLoadFailedDesc')}>
        <Button
          onClick={onRetry}
          disabled={retrying}
          className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green"
        >
          {retrying ? t('retrying') : t('retry')}
        </Button>
      </EmptyState>
    );
  } else if (gyms.length === 0) {
    body = <EmptyState emoji="🏋️" title={t('gymsNoneYet')} desc={t('gymsNoneYetDesc')} />;
  } else if (shown.length === 0) {
    body = (
      <EmptyState emoji="🔍" title={t('gymsNoMatch')} desc={t('gymsNoMatchDesc')}>
        <Button
          onClick={() => setQuery('')}
          className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green"
        >
          {t('clearSearch')}
        </Button>
      </EmptyState>
    );
  } else {
    // No heading: the tab the viewer just picked already says what this is.
    body = <GymsAndStudiosSection gyms={shown} showHeading={false} />;
  }

  return (
    <div className="space-y-4" data-testid="gyms-panel">
      {!failed && gyms.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
          <Input
            type="text"
            placeholder={t('gymsSearch')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 py-2 rounded-lg bg-white dark:bg-tribe-surface border-stone-200 dark:border-tribe-mid"
          />
        </div>
      )}
      {body}
    </div>
  );
}

function EmptyState({
  emoji,
  title,
  desc,
  children,
}: {
  emoji: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center p-6">
      <div className="text-5xl mb-4">{emoji}</div>
      <h2 className="text-xl font-semibold text-theme-primary mb-2">{title}</h2>
      <p className="text-sm text-theme-secondary mb-6">{desc}</p>
      {children}
    </div>
  );
}
