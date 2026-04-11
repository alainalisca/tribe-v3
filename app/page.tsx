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
import LiveNowSection from '@/components/home/LiveNowSection';
import ConfirmDialog from '@/components/ConfirmDialog';
import FeaturedInstructors from '@/components/FeaturedInstructors';
import FeaturedPartnerBanner from '@/components/FeaturedPartnerBanner';
import FindTrainingPartners from '@/components/FindTrainingPartners';
import NearbyEvents from '@/components/NearbyEvents';
import PopularVenuesSection from '@/components/PopularVenuesSection';
import PopularRoutesSection from '@/components/PopularRoutesSection';
import FirstMoverCTA from '@/components/FirstMoverCTA';
import InstructorUpsellBanner from '@/components/InstructorUpsellBanner';
import { getUserLocation } from '@/lib/location';
import { showInfo } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useHomeFeed } from './useHomeFeed';
import LandingPage from './LandingPage';

export default function HomePage() {
  const f = useHomeFeed();

  // Show minimal splash while auth is resolving
  if (!f.userChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#272D34]">
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
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-[#52575D]">
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
      />

      <div style={{ paddingTop: f.fixedHeight || undefined }} className={f.fixedHeight ? '' : 'pt-header'}>
        <div className="max-w-2xl mx-auto p-4">
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
          <div className="mt-1">
            <StoriesRow
              userId={f.user?.id || null}
              userAvatar={f.userProfile?.avatar_url}
              liveUserIds={f.liveUserIdSet}
            />
          </div>

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

          {/* ── Training Now CTA ── */}
          {f.user && (
            <button
              onClick={() => f.router.push('/training-now')}
              className="w-full py-3 bg-tribe-green/10 border border-tribe-green/30 text-theme-primary rounded-xl hover:opacity-90 transition flex items-center justify-center gap-3 shadow-none mb-4"
            >
              <div className="text-center">
                <div className="text-sm font-semibold">{f.t('trainingNowLabel')}</div>
                <div className="text-xs text-muted-foreground">{f.t('connectNearby')}</div>
              </div>
            </button>
          )}

          {/* ══ MAIN FEED: Sessions with interleaved discovery ══ */}
          {f.loading ? (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : f.fetchError ? (
            <Card className="dark:bg-[#6B7178] border-stone-200 dark:border-[#52575D] shadow-none">
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
            <Card className="dark:bg-[#6B7178] border-stone-200 dark:border-[#52575D] shadow-none">
              <CardContent className="p-8 text-center">
                {f.searchQuery || f.selectedSport || f.dateFilter !== 'all' || f.genderFilter !== 'all' ? (
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
                const INTERLEAVE_INTERVAL = 3;

                // Featured Partner banner after 2nd session card
                const partnerSlotPosition = 2;

                // Discovery sections to interleave after every N session cards
                const discoverySlots: Record<number, React.ReactNode> = {
                  [INTERLEAVE_INTERVAL]: f.user ? (
                    <FeaturedInstructors key="disc-instructors" language={f.language} />
                  ) : null,
                  [INTERLEAVE_INTERVAL * 2]: f.user ? (
                    <FindTrainingPartners key="disc-partners" language={f.language} />
                  ) : null,
                  [INTERLEAVE_INTERVAL * 3]: f.user ? <NearbyEvents key="disc-events" language={f.language} /> : null,
                  [INTERLEAVE_INTERVAL * 4]: f.user ? (
                    <PopularVenuesSection key="disc-venues" language={f.language} />
                  ) : null,
                  [INTERLEAVE_INTERVAL * 5]: f.user ? (
                    <PopularRoutesSection key="disc-routes" language={f.language} />
                  ) : null,
                };

                // Conditional banners: tuck after first session card
                const bannerSlot = (
                  <div key="banners" className="space-y-3">
                    {f.user && f.userProfile && (
                      <ProfileCompletionBanner
                        hasPhoto={!!f.userProfile.avatar_url}
                        hasSports={!!f.userProfile.sports && f.userProfile.sports.length > 0}
                        hasName={!!f.userProfile.name}
                        userId={f.user.id}
                      />
                    )}
                    {f.user && <StreakBanner userId={f.user.id} />}
                    {f.user && <ReferralBanner userId={f.user.id} />}
                    {f.user && f.userProfile && !f.userProfile.is_instructor && (
                      <InstructorUpsellBanner userId={f.user.id} language={f.language} />
                    )}
                  </div>
                );

                const items: React.ReactNode[] = [];

                visibleSessions.forEach((session, index) => {
                  items.push(
                    <SessionCard
                      key={session.id}
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
                  );

                  const position = index + 1;

                  // Insert banners after first session card
                  if (position === 1) {
                    items.push(bannerSlot);
                  }

                  // Insert Featured Partner banner after 2nd session card
                  if (position === partnerSlotPosition && f.user) {
                    items.push(<FeaturedPartnerBanner key="featured-partner" />);
                  }

                  // Insert discovery sections at interleave points
                  if (discoverySlots[position]) {
                    items.push(discoverySlots[position]);
                  }
                });

                // If fewer sessions than discovery slots, append remaining discovery at the end
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
                  className="w-full py-3 bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white font-medium rounded-xl border border-stone-200 dark:border-[#52575D] hover:bg-stone-100 dark:hover:bg-[#7D8490] transition"
                >
                  {f.language === 'es'
                    ? `Mostrar más (${f.filteredSessions.length - f.visibleCount} restantes)`
                    : `Show more (${f.filteredSessions.length - f.visibleCount} remaining)`}
                </button>
              )}
            </div>
          )}
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
