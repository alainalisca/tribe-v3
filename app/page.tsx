/** Page: / — Landing page for visitors, home feed for logged-in users */
'use client';

import OnboardingModal from '@/components/OnboardingModal';
import EditSessionModal from '@/components/EditSessionModal';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner';
import StreakBanner from '@/components/StreakBanner';
import ReferralBanner from '@/components/ReferralBanner';
import { SkeletonCard } from '@/components/Skeleton';
import SafetyWaiverModal from '@/components/SafetyWaiverModal';
import StoriesRow from '@/components/StoriesRow';
import FilterBar from '@/components/home/FilterBar';
import CityGreeting from '@/components/home/CityGreeting';
import LiveNowSection from '@/components/home/LiveNowSection';
import ConfirmDialog from '@/components/ConfirmDialog';
import FeaturedInstructors from '@/components/FeaturedInstructors';
import FeaturedPartnerBanner from '@/components/FeaturedPartnerBanner';
import FindTrainingPartners from '@/components/FindTrainingPartners';
import LocalFitnessEventsSection from '@/components/LocalFitnessEventsSection';
import AnimatedCard from '@/components/AnimatedCard';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import StoriesCarousel from '@/components/StoriesCarousel';
import PopularVenuesSection from '@/components/PopularVenuesSection';
import PopularRoutesSection from '@/components/PopularRoutesSection';
import ExploreCitySection from '@/components/home/ExploreCitySection';
import FeedPostPreview from '@/components/home/FeedPostPreview';
import FirstMoverCTA from '@/components/FirstMoverCTA';
import InstructorUpsellBanner from '@/components/InstructorUpsellBanner';
import { getUserLocation } from '@/lib/location';
import { ACTIVE_CITY } from '@/lib/city-config';
import { showInfo } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHomeFeed } from './useHomeFeed';
import LandingPage from './LandingPage';

export default function HomePage() {
  const f = useHomeFeed();
  const { pullDistance, isRefreshing, handlers } = usePullToRefresh({
    onRefresh: async () => {
      await f.loadSessions();
    },
    threshold: 80,
  });

  // Show minimal splash while auth is resolving
  if (!f.userChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-tribe-card">
        <img
          src="/tribe-wordmark.png"
          alt="Tribe"
          className="hidden dark:block"
          style={{ height: 64, objectFit: 'contain' }}
        />
        <img
          src="/tribe-wordmark-dark.png"
          alt="Tribe"
          className="block dark:hidden"
          style={{ height: 64, objectFit: 'contain' }}
        />
      </div>
    );
  }

  // Show landing page for unauthenticated visitors
  if (!f.user) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-tribe-mid">
      {f.showOnboarding && f.user && (
        <OnboardingModal
          onComplete={() => {
            localStorage.setItem(`hasSeenOnboarding_${f.user!.id}`, 'true');
            f.setShowOnboarding(false);
          }}
        />
      )}

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
        userLocation={f.userLocation}
        loading={f.loading}
        filteredCount={f.filteredSessions.length}
        language={f.language}
        t={f.t}
        onFixedHeightChange={f.setFixedHeight}
        selectedNeighborhood={f.selectedNeighborhood}
        onNeighborhoodChange={f.setSelectedNeighborhood}
      />

      <div
        {...handlers}
        style={{ paddingTop: f.fixedHeight || undefined }}
        className={f.fixedHeight ? '' : 'pt-header'}
      >
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} threshold={80} />
        <div className="max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6">
          {f.editingSession && (
            <EditSessionModal
              session={f.editingSession}
              onClose={() => f.setEditingSession(null)}
              onSave={() => {
                f.loadSessions();
                f.setEditingSession(null);
              }}
            />
          )}

          {/* ── Stories ── */}
          <div className="mb-2">
            <StoriesRow
              userId={f.user?.id || null}
              userAvatar={f.userProfile?.avatar_url}
              liveUserIds={f.liveUserIdSet}
            />
          </div>

          {/* ── Combined City Greeting + Weather (single line) ── */}
          <CityGreeting activeHood={ACTIVE_CITY.neighborhoods.find((n) => n.id === f.selectedNeighborhood) || null} />

          {/* ── Location prompt (only if needed) ── */}
          {f.user && !f.userLocation && !f.loading && (
            <button
              onClick={async () => {
                const loc = await getUserLocation();
                if (loc) f.setUserLocation(loc);
                else {
                  const { Capacitor } = await import('@capacitor/core');
                  showInfo(
                    f.t(Capacitor.isNativePlatform() ? 'enableLocationSettingsNative' : 'enableLocationSettings')
                  );
                }
              }}
              className="w-full mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300 flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
            >
              📍 {f.t('enableLocationNearby')}
            </button>
          )}

          {/* ── Live Now (only when sessions exist) ── */}
          <LiveNowSection liveNowSessions={f.liveNowSessions} userLocation={f.userLocation} language={f.language} />

          {/* ══ MAIN FEED: Sessions with interleaved discovery ══ */}
          {f.loading ? (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : f.fetchError ? (
            <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
              <CardContent className="p-8 text-center">
                <div className="text-4xl mb-4">⚠️</div>
                <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                  {f.t('couldNotLoadSessions')}
                </p>
                <p className="text-sm text-muted-foreground mb-4">{f.t('checkConnectionRetry')}</p>
                <Button onClick={() => f.loadSessions()} className="px-6 py-3 font-bold">
                  {f.t('retry')}
                </Button>
              </CardContent>
            </Card>
          ) : f.filteredSessions.length === 0 ? (
            <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
              <CardContent className="p-8 text-center">
                {f.searchQuery ||
                f.selectedSport ||
                f.dateFilter !== 'all' ||
                f.genderFilter !== 'all' ||
                f.selectedNeighborhood ? (
                  <>
                    <div className="text-4xl mb-4">🔍</div>
                    <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                      {f.t('noMatchingFilters')}
                    </p>
                    <p className="text-sm text-muted-foreground mb-4">{f.t('tryDifferentSearch')}</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        f.setSearchQuery('');
                        f.setSelectedSport('');
                        f.setDateFilter('all');
                        f.setGenderFilter('all');
                        f.setSelectedNeighborhood(null);
                      }}
                      className="px-6 py-3 border-2 border-tribe-green text-tribe-green font-bold hover:bg-tribe-green hover:text-slate-900"
                    >
                      {f.t('clearFilters')}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="text-4xl mb-4">🏃‍♂️</div>
                    <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                      {f.t('noSessionsFound')}
                    </p>
                    <p className="text-sm text-muted-foreground">{f.t('tryDifferentSearch')}</p>
                    <div className="mt-4">
                      <FirstMoverCTA
                        locationName={
                          f.userLocation
                            ? f.language === 'es'
                              ? 'tu zona'
                              : 'your area'
                            : f.language === 'es'
                              ? 'tu zona'
                              : 'your area'
                        }
                        language={f.language}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(() => {
                const visibleSessions = f.filteredSessions.slice(0, f.visibleCount);

                // Discovery & banner slots keyed by position (after Nth session card)
                const discoverySlots: Record<number, React.ReactNode> = {
                  // After 2nd card: social post preview + featured partner
                  2: f.user ? <FeedPostPreview key="disc-post-preview" /> : null,
                  // After 3rd card: banners (ProfileCompletion, Streak, Referral, InstructorUpsell)
                  3: f.user ? (
                    <div key="banners" className="space-y-3">
                      {f.userProfile && (
                        <ProfileCompletionBanner
                          hasPhoto={!!f.userProfile.avatar_url}
                          hasSports={!!f.userProfile.sports && f.userProfile.sports.length > 0}
                          hasName={!!f.userProfile.name}
                          userId={f.user.id}
                        />
                      )}
                      <StreakBanner userId={f.user.id} />
                      <ReferralBanner userId={f.user.id} />
                      {f.userProfile && !f.userProfile.is_instructor && (
                        <InstructorUpsellBanner userId={f.user.id} language={f.language} />
                      )}
                    </div>
                  ) : null,
                  // After 4th card: FeaturedInstructors
                  4: f.user ? <FeaturedInstructors key="disc-instructors" language={f.language} /> : null,
                  // After 5th card: FeaturedPartnerBanner
                  5: f.user ? <FeaturedPartnerBanner key="featured-partner" /> : null,
                  6: f.user ? <FindTrainingPartners key="disc-partners" language={f.language} /> : null,
                  9: f.user ? <LocalFitnessEventsSection key="disc-events" language={f.language} /> : null,
                  12: f.user ? (
                    <StoriesCarousel key="disc-stories" language={f.language} userId={f.user?.id || null} />
                  ) : null,
                  15: f.user ? <PopularVenuesSection key="disc-venues" language={f.language} /> : null,
                  18: f.user ? <PopularRoutesSection key="disc-routes" language={f.language} /> : null,
                };

                const items: React.ReactNode[] = [];

                visibleSessions.forEach((session, index) => {
                  items.push(
                    <AnimatedCard key={session.id} index={index}>
                      <SessionCard
                        session={session}
                        onJoin={f.handleJoinSession}
                        userLocation={f.userLocation}
                        currentUserId={f.user?.id}
                        onEdit={(id: string) => {
                          const s = f.sessions.find((s) => s.id === id);
                          if (s) f.setEditingSession(s);
                        }}
                        onDelete={f.handleDeleteSession}
                        onShare={f.handleShareSession}
                        distance={f.getDistanceText(session)}
                        liveData={f.liveStatusMap[session.id]}
                      />
                    </AnimatedCard>
                  );

                  const position = index + 1;

                  // Insert discovery/banner slots at their designated positions
                  if (discoverySlots[position]) {
                    items.push(discoverySlots[position]);
                  }
                });

                // Append any remaining discovery slots beyond visible sessions
                Object.entries(discoverySlots).forEach(([pos, node]) => {
                  if (Number(pos) > visibleSessions.length && node) {
                    items.push(node);
                  }
                });

                return items;
              })()}
              {f.visibleCount < f.filteredSessions.length && (
                <button
                  onClick={() => f.setVisibleCount((prev) => prev + f.PAGE_SIZE)}
                  className="w-full py-3 bg-white dark:bg-tribe-card text-stone-700 dark:text-white font-medium rounded-xl border border-stone-200 dark:border-tribe-mid hover:bg-stone-100 dark:hover:bg-tribe-card transition"
                >
                  {f.language === 'es'
                    ? `Mostrar más (${f.filteredSessions.length - f.visibleCount} restantes)`
                    : `Show more (${f.filteredSessions.length - f.visibleCount} remaining)`}
                </button>
              )}
            </div>
          )}

          {/* ── Explore City Neighborhoods ── */}
          <ExploreCitySection />
        </div>
      </div>

      {f.showSafetyWaiver && (
        <SafetyWaiverModal
          onAccept={f.handleWaiverAccepted}
          onCancel={() => {
            f.setShowSafetyWaiver(false);
            f.setPendingSessionId(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!f.confirmAction}
        title={f.confirmAction?.title ?? ''}
        message={f.confirmAction?.message ?? ''}
        confirmLabel={f.confirmAction?.confirmLabel ?? f.t('confirm')}
        cancelLabel={f.t('cancel')}
        variant={f.confirmAction?.variant ?? 'default'}
        onConfirm={() => f.confirmAction?.onConfirm()}
        onCancel={() => f.setConfirmAction(null)}
      />

      <BottomNav />
      <NotificationPrompt hideWhenOnboarding={f.showOnboarding} />
    </div>
  );
}
