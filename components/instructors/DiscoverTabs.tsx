'use client';

/**
 * The Instructores / Gimnasios y estudios switch at the top of Discover.
 *
 * A segmented control rather than two links: both lists are already on the
 * page (the server fetches both), so switching is instant and keeps the
 * viewer's place. Each option shows its count so an athlete knows there is
 * something on the other side before tapping.
 *
 * Accessible as a tablist: arrow keys are not wired because there are only two
 * options and both are always visible; role and aria-selected are what a
 * screen reader needs to announce which list is showing.
 */
import { Users, Building2 } from 'lucide-react';
import type { DiscoverTab } from '@/lib/discover/discoverTab';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface Props {
  tab: DiscoverTab;
  onChange: (tab: DiscoverTab) => void;
  instructorCount: number;
  gymCount: number;
}

export default function DiscoverTabs({ tab, onChange, instructorCount, gymCount }: Props) {
  const t = useTranslations('discover');
  const options: { id: DiscoverTab; label: string; count: number; Icon: typeof Users }[] = [
    { id: 'instructors', label: t('tabInstructors'), count: instructorCount, Icon: Users },
    { id: 'gyms', label: t('tabGyms'), count: gymCount, Icon: Building2 },
  ];

  return (
    <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 dark:bg-tribe-surface p-1">
      {options.map(({ id, label, count, Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`discover-tab-${id}`}
            onClick={() => {
              if (!active) onChange(id);
            }}
            // Active: white chip with dark text. Green stays a fill or an icon
            // colour here, never small text on a light surface (CLAUDE.md).
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2.5 text-sm font-semibold transition ${
              active
                ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm'
                : 'text-stone-500 dark:text-stone-400 hover:text-theme-primary'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-tribe-green-dark dark:text-tribe-green' : ''}`} />
            <span className="truncate">{label}</span>
            <span
              className={`rounded-full px-1.5 text-xs font-bold ${
                active
                  ? 'bg-tribe-green text-tribe-dark'
                  : 'bg-stone-200 dark:bg-tribe-dark text-stone-600 dark:text-stone-300'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
