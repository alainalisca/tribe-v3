'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { SkeletonProfile, SkeletonCard } from '@/components/Skeleton';
import { haptic } from '@/lib/haptics';
import { goBack } from '@/lib/navigation';
import StorefrontProfileColumn from '@/components/storefront/StorefrontProfileColumn';
import StorefrontHero from '@/components/storefront/StorefrontHero';
import StorefrontTrustBar from '@/components/storefront/StorefrontTrustBar';
import StorefrontTabs, { type StorefrontTab } from '@/components/storefront/StorefrontTabs';
import StorefrontTabPanels from '@/components/storefront/StorefrontTabPanels';
import StorefrontEmpty from '@/components/storefront/StorefrontEmpty';
import BlockReportControls from '@/components/BlockReportControls';
import { useStorefrontData } from './useStorefrontData';

export default function StorefrontPage() {
  const params = useParams();
  const { language } = useLanguage();
  const lang = language as 'en' | 'es';
  const instructorId = params.id as string;

  const d = useStorefrontData(instructorId);
  const [activeTab, setActiveTab] = useState('sessions');

  const tabs = useMemo<StorefrontTab[]>(() => {
    const reviews = d.instructor?.total_reviews ?? 0;
    const defs = [
      {
        id: 'sessions',
        label: lang === 'es' ? 'Sesiones' : 'Sessions',
        count: d.sessions.length,
        show: d.sessions.length > 0,
      },
      {
        id: 'products',
        label: lang === 'es' ? 'Productos' : 'Products',
        count: d.productCount ?? undefined,
        show: d.productCount === null || (d.productCount ?? 0) > 0,
      },
      {
        id: 'packages',
        label: lang === 'es' ? 'Paquetes' : 'Packages',
        count: d.packages.length,
        show: d.packages.length > 0,
      },
      { id: 'media', label: lang === 'es' ? 'Medios' : 'Media', count: d.media.length, show: d.media.length > 0 },
      {
        id: 'posts',
        label: lang === 'es' ? 'Publicaciones' : 'Posts',
        count: d.posts.length,
        show: d.posts.length > 0,
      },
      { id: 'reviews', label: lang === 'es' ? 'Reseñas' : 'Reviews', count: reviews, show: reviews > 0 },
    ];
    return defs.filter((t) => t.show).map(({ id, label, count }) => ({ id, label, count }));
  }, [d.sessions, d.productCount, d.packages, d.media, d.posts, d.instructor, lang]);

  // Keep the active tab valid as data resolves (spec 6C: default Sessions,
  // fall back to the first available tab if Sessions has no content).
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const goToSessions = () => {
    haptic('light');
    setActiveTab('sessions');
    document.getElementById('storefront-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const isOwn = d.currentUserId === instructorId;
  const isAthleteViewer = !!d.currentUserId && !isOwn;
  const canBook = tabs.some((t) => t.id === 'sessions');
  const hasContent = tabs.length > 0;

  if (d.loading) {
    return (
      <div className="min-h-screen bg-theme-page">
        <div className="max-w-5xl mx-auto p-4 md:p-6 pt-20 space-y-4">
          <SkeletonProfile />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!d.instructor) {
    return (
      <div className="min-h-screen bg-theme-page pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-header border-b border-theme">
          <div className="max-w-5xl mx-auto h-14 flex items-center gap-3 px-4">
            <button onClick={() => goBack()} className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center">
              <ArrowLeft className="w-6 h-6 text-theme-primary hover:opacity-70" />
            </button>
            <h1 className="text-lg font-bold text-theme-primary">
              {lang === 'es' ? 'Perfil del Instructor' : 'Instructor Profile'}
            </h1>
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🏋️</div>
            <p className="text-lg font-semibold text-theme-primary mb-2">
              {lang === 'es' ? 'Instructor no encontrado' : 'Instructor not found'}
            </p>
            <p className="text-sm text-theme-tertiary mb-6">
              {lang === 'es'
                ? 'Este perfil no existe o no está disponible.'
                : "This profile doesn't exist or is not available."}
            </p>
            <button
              onClick={() => goBack()}
              className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:opacity-90 transition"
            >
              {lang === 'es' ? 'Volver' : 'Go Back'}
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  const instructor = d.instructor;

  // Profile column — shared by the mobile stack and the desktop sidebar.
  const profileColumn = (
    <StorefrontProfileColumn
      instructor={instructor}
      lang={lang}
      instructorId={instructorId}
      currentUserId={d.currentUserId}
      isOwn={isOwn}
      isAthleteViewer={isAthleteViewer}
      partnerData={d.partnerData}
      partnerInstructors={d.partnerInstructors}
      followState={d.followState}
      onFollowToggle={d.handleFollowToggle}
      canBook={canBook}
      onBook={goToSessions}
    />
  );

  return (
    <div className="min-h-screen bg-theme-page pb-32 lg:pb-12">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-header border-b border-theme">
        <div className="max-w-5xl mx-auto h-14 flex items-center px-4">
          <button onClick={() => goBack()} className="text-theme-primary hover:text-tribe-green transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="flex-1 text-center text-theme-primary font-semibold truncate px-2">{instructor.name}</h2>
          {/* T-H1: block/report an instructor — same mechanism the profile page uses.
              Self-gates (renders nothing for the owner or logged-out viewers), so it
              replaces the header's balance spacer. */}
          <BlockReportControls targetUserId={instructorId} viewerId={d.currentUserId} />
        </div>
      </div>

      {/* BUG-006: overflow-x-clip contains any child wider than the viewport so
          the centered (mx-auto) main can't split the overflow and shift the whole
          page left. `clip` (not `hidden`) avoids creating a scroll container, so
          the sticky sidebar + sticky tabs below keep working. */}
      <main className="pt-header max-w-5xl mx-auto overflow-x-clip">
        <StorefrontHero instructor={instructor} language={lang} />

        {!hasContent ? (
          // No offerings yet — single centered column, no empty void.
          // BUG-026: extra bottom padding so the empty state doesn't sit
          // flush against (or get covered by) the fixed bottom nav.
          <div className="px-4 md:px-6 mt-4 mb-24 max-w-xl mx-auto space-y-4">
            <StorefrontTrustBar
              instructor={instructor}
              sessions={d.sessions}
              language={lang}
              orientation="horizontal"
            />
            {profileColumn}
            <StorefrontEmpty language={lang} isOwner={isOwn} />
          </div>
        ) : (
          <>
            {/* Below lg: single centered column. lg+: two-column. */}
            <div className="px-4 md:px-6 mt-4 lg:hidden max-w-xl mx-auto">
              <StorefrontTrustBar
                instructor={instructor}
                sessions={d.sessions}
                language={lang}
                orientation="horizontal"
              />
            </div>

            <div className="lg:grid lg:grid-cols-[300px_1fr] lg:gap-8 px-4 md:px-6 mt-4">
              <aside className="lg:sticky lg:top-20 lg:self-start space-y-4 w-full max-w-xl mx-auto lg:mx-0 lg:max-w-none">
                <div className="hidden lg:block">
                  <StorefrontTrustBar
                    instructor={instructor}
                    sessions={d.sessions}
                    language={lang}
                    orientation="vertical"
                  />
                </div>
                {profileColumn}
              </aside>

              <section className="mt-4 lg:mt-0 w-full max-w-xl mx-auto lg:mx-0 lg:max-w-none">
                <div
                  id="storefront-tabs"
                  className="sticky top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-30 bg-theme-page py-2"
                >
                  <StorefrontTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />
                </div>
                <div className="mt-2">
                  <StorefrontTabPanels
                    activeTab={activeTab}
                    language={lang}
                    instructorId={instructorId}
                    currentUserId={d.currentUserId}
                    sessions={d.sessions}
                    packages={d.packages}
                    media={d.media}
                    posts={d.posts}
                    likedPosts={d.likedPosts}
                    joinedSessionIds={d.joinedSessionIds}
                    onSessionJoined={d.handleSessionJoined}
                    onPostLike={d.handlePostLike}
                  />
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      {/* Sticky bottom CTA (mobile only) */}
      {canBook && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 safe-area-bottom pointer-events-none">
          <button
            onClick={goToSessions}
            className="pointer-events-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm shadow-tribe-green hover:opacity-90 transition"
          >
            <CalendarCheck className="w-4 h-4" />
            {lang === 'es' ? 'Reservar una sesión' : 'Book a session'}
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
