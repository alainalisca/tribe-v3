/** Page: / — Home feed with session discovery, filters, and stories */
'use client';

import Link from 'next/link';
import OnboardingModal from '@/components/OnboardingModal';
import EditSessionModal from '@/components/EditSessionModal';
import SessionCard from '@/components/SessionCard';
import BottomNav from '@/components/BottomNav';
import NotificationPrompt from '@/components/NotificationPrompt';
import ProfileCompletionBanner from '@/components/ProfileCompletionBanner';
import { SkeletonCard } from '@/components/Skeleton';
import SafetyWaiverModal from '@/components/SafetyWaiverModal';
import StoriesRow from '@/components/StoriesRow';
import FilterBar from '@/components/home/FilterBar';
import LiveNowSection from '@/components/home/LiveNowSection';
import { getUserLocation } from '@/lib/location';
import { showInfo } from '@/lib/toast';
import { useHomeFeed } from './useHomeFeed';

export default function HomePage() {
  const f = useHomeFeed();

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

          <div className="mt-1">
            <StoriesRow
              userId={f.user?.id || null}
              userAvatar={f.userProfile?.avatar_url}
              liveUserIds={f.liveUserIdSet}
            />
          </div>

          {f.user && !f.userLocation && !f.loading && (
            <button
              onClick={async () => {
                const loc = await getUserLocation();
                if (loc) f.setUserLocation(loc);
                else
                  showInfo(
                    f.language === 'es'
                      ? 'Activa la ubicación en la configuración de tu navegador'
                      : 'Enable location in your browser settings'
                  );
              }}
              className="w-full mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-800 dark:text-blue-300 flex items-center justify-center gap-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition"
            >
              📍{' '}
              {f.language === 'es'
                ? 'Activa tu ubicación para ver sesiones cercanas'
                : 'Enable location to see sessions near you'}
            </button>
          )}

          {f.user && f.userProfile && (
            <ProfileCompletionBanner
              hasPhoto={!!f.userProfile.avatar_url}
              hasSports={!!f.userProfile.sports && f.userProfile.sports.length > 0}
              hasName={!!f.userProfile.name}
              userId={f.user.id}
            />
          )}

          {f.user && (
            <button
              onClick={() => f.router.push('/training-now')}
              className="w-full py-4 bg-gradient-to-r from-tribe-green to-lime-400 text-slate-900 font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-3 shadow-lg mb-4"
            >
              <div className="text-center">
                <div className="text-lg">{f.language === 'es' ? 'ENTRENAR AHORA' : 'TRAINING NOW'}</div>
                <div className="text-xs font-normal opacity-75">
                  {f.language === 'es'
                    ? 'Conecta con personas entrenando cerca'
                    : 'Connect with people training nearby'}
                </div>
              </div>
            </button>
          )}

          <LiveNowSection liveNowSessions={f.liveNowSessions} userLocation={f.userLocation} language={f.language} />

          {f.loading ? (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : f.fetchError ? (
            <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
              <div className="text-4xl mb-4">⚠️</div>
              <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
                {f.language === 'es' ? 'No se pudieron cargar las sesiones' : 'Could not load sessions'}
              </p>
              <p className="text-sm text-stone-500 dark:text-gray-400 mb-4">
                {f.language === 'es'
                  ? 'Verifica tu conexión e inténtalo de nuevo'
                  : 'Check your connection and try again'}
              </p>
              <button
                onClick={() => f.loadSessions()}
                className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
              >
                {f.language === 'es' ? 'Reintentar' : 'Retry'}
              </button>
            </div>
          ) : f.filteredSessions.length === 0 ? (
            <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D]">
              <div className="text-4xl mb-4">🏃‍♂️</div>
              <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{f.t('noSessionsFound')}</p>
              <p className="text-sm text-stone-500 dark:text-gray-400 mb-4">{f.t('tryDifferentSearch')}</p>
              <Link href="/create">
                <button className="px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition">
                  {f.language === 'es' ? 'Crear Sesión' : 'Create Session'}
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {f.filteredSessions.slice(0, f.visibleCount).map((session) => (
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
              ))}
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

      <BottomNav />
      <NotificationPrompt hideWhenOnboarding={f.showOnboarding} />
    </div>
  );
}
