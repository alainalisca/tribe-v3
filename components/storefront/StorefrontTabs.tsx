'use client';

import { haptic } from '@/lib/haptics';

export interface StorefrontTab {
  id: string;
  label: string;
  /** Shown as a "(n)" badge. Tabs with no content are filtered out by the page (spec 6C). */
  count?: number;
}

interface StorefrontTabsProps {
  tabs: StorefrontTab[];
  activeTab: string;
  onSelect: (id: string) => void;
}

/**
 * Storefront tab bar (spec 6C). The parent controls stickiness via a
 * sticky wrapper; this only renders the row. Count badges shown when a
 * count is provided. Theme tokens only.
 */
export default function StorefrontTabs({ tabs, activeTab, onSelect }: StorefrontTabsProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:overflow-visible"
      role="tablist"
      aria-orientation="horizontal"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => {
              haptic('light');
              onSelect(tab.id);
            }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
              active
                ? 'bg-tribe-green text-slate-900'
                : 'bg-theme-surface text-theme-secondary hover:text-theme-primary'
            }`}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className={active ? 'ml-1 opacity-80' : 'ml-1 text-theme-tertiary'}>({tab.count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
