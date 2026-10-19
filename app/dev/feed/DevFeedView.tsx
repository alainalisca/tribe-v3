'use client';

import { useMemo, useState } from 'react';
import SessionCard from '@/components/SessionCard';
import FilterBar from '@/components/home/FilterBar';
import FeedHeader from '@/components/home/FeedHeader';
import FeedDayGroups from '@/components/home/FeedDayGroups';
import { useSessionFiltering } from '@/app/hooks/useSessionFiltering';
import { useLanguage } from '@/lib/LanguageContext';
import { feedSports, groupFeed, seriesDaysLabel } from '@/lib/feed/feedGroups';
import type { SessionWithRelations } from '@/lib/dal/sessions';

const noop = () => {};

/** /dev/feed's client half: the same components the home feed renders, with no-op actions. */
export default function DevFeedView({
  layout,
  sessions,
  recapPhotosByCreator,
  hostPhotos,
}: {
  layout: 'before' | 'after';
  sessions: SessionWithRelations[];
  recapPhotosByCreator: Record<string, string[]>;
  hostPhotos: Record<string, { url: string; x: number; y: number } | null>;
}) {
  const { language, t } = useLanguage();
  const f = useSessionFiltering({ sessions, userLocation: null });
  const [fixedHeight, setFixedHeight] = useState(0);
  const groups = useMemo(() => groupFeed(f.filteredSessions), [f.filteredSessions]);
  const sports = useMemo(() => feedSports(sessions), [sessions]);

  return (
    <div className="min-h-screen bg-theme-page">
      {layout === 'before' ? (
        <FilterBar
          searchQuery={f.searchQuery}
          setSearchQuery={f.setSearchQuery}
          selectedSport={f.selectedSport}
          setSelectedSport={f.setSelectedSport}
          dateFilter={f.dateFilter}
          setDateFilter={f.setDateFilter}
          genderFilter={f.genderFilter}
          setGenderFilter={f.setGenderFilter}
          pricingFilter={f.pricingFilter}
          setPricingFilter={f.setPricingFilter}
          maxDistance={f.maxDistance}
          setMaxDistance={f.setMaxDistance}
          userLocation={null}
          loading={false}
          filteredCount={f.filteredSessions.length}
          language={language}
          t={t}
          onFixedHeightChange={setFixedHeight}
          selectedNeighborhood={f.selectedNeighborhood}
          onNeighborhoodChange={f.setSelectedNeighborhood}
        />
      ) : (
        <FeedHeader
          sports={sports}
          selectedSport={f.selectedSport}
          onSportChange={f.setSelectedSport}
          freeOnly={f.pricingFilter === 'free'}
          onFreeOnlyChange={(free) => f.setPricingFilter(free ? 'free' : 'all')}
          searchQuery={f.searchQuery}
          onSearchChange={f.setSearchQuery}
          language={language}
          onFixedHeightChange={setFixedHeight}
        />
      )}
      <div style={{ paddingTop: fixedHeight || undefined }} className="max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          /dev/feed ({layout === 'before' ? 'today' : 'T-UI-FD1'}): {sessions.length} upcoming sessions, read only.
        </p>
        {layout === 'before' ? (
          <div className="space-y-4">
            {f.filteredSessions.map((session, index) => (
              <SessionCard
                key={session.id}
                session={session}
                onEdit={noop}
                onDelete={noop}
                priority={index < 2}
                recapPhotos={recapPhotosByCreator[session.creator_id ?? ''] ?? []}
              />
            ))}
          </div>
        ) : (
          <FeedDayGroups
            groups={groups}
            language={language}
            renderCard={(item, index) => (
              <SessionCard
                session={item.session}
                onEdit={noop}
                onDelete={noop}
                priority={index < 2}
                hostPhoto={hostPhotos[item.session.creator_id ?? ''] ?? null}
                seriesDays={item.seriesDays ? seriesDaysLabel(item.seriesDays, language) : null}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
