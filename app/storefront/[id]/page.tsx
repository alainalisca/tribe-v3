'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, Share2, CalendarCheck } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { SkeletonProfile, SkeletonCard } from '@/components/Skeleton';
import { getInstructorShareUrl, copyToClipboard } from '@/lib/share';
import { showSuccess } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import CredentialsBadges from '@/components/instructor/CredentialsBadges';
import VideoIntro from '@/components/instructor/VideoIntro';
import AvailabilityPreview from '@/components/instructor/AvailabilityPreview';
import InterestButton from '@/components/instructor/InterestButton';
import TipButton from '@/components/TipButton';
import PartnerStorefrontBadge from '@/components/storefront/PartnerStorefrontBadge';
import PartnerInstructorRoster from '@/components/storefront/PartnerInstructorRoster';
import StorefrontHero from '@/components/storefront/StorefrontHero';
import StorefrontTrustBar from '@/components/storefront/StorefrontTrustBar';
import StorefrontTabs, { type StorefrontTab } from '@/components/storefront/StorefrontTabs';
import StorefrontTabPanels from '@/components/storefront/StorefrontTabPanels';
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
            <button
              onClick={() => window.history.back()}
              className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center"
            >
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
              onClick={() => window.history.back()}
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
    <div className="space-y-4">
      {d.partnerData && <PartnerStorefrontBadge partner={d.partnerData} language={language} />}
      {instructor.bio && (
        <div className="bg-theme-card rounded-2xl p-4 border border-theme">
          <p className="text-theme-secondary text-sm leading-relaxed">{instructor.bio}</p>
        </div>
      )}
      <CredentialsBadges
        certifications={instructor.certifications || []}
        isVerified={!!instructor.verified}
        yearsExperience={instructor.years_experience || 0}
        language={lang}
      />
      <VideoIntro
        videoUrl={instructor.storefront_video_url}
        posterUrl={instructor.storefront_banner_url}
        isOwnStorefront={isOwn}
        language={lang}
      />
      <AvailabilityPreview instructorId={instructorId} language={lang} />
      {isAthleteViewer && (
        <InterestButton
          athleteId={d.currentUserId!}
          instructorId={instructorId}
          instructorName={instructor.name}
          specialties={instructor.specialties || []}
          language={lang}
        />
      )}
      {isAthleteViewer && (
        <TipButton
          tipperId={d.currentUserId!}
          instructorId={instructorId}
          instructorName={instructor.name}
          currency={lang === 'en' ? 'USD' : 'COP'}
          language={lang}
        />
      )}
      <button
        onClick={d.handleFollowToggle}
        className={`w-full px-3 py-2 rounded-xl font-semibold transition-all text-sm ${
          d.followState.isFollowing
            ? 'bg-tribe-green/20 text-tribe-green border border-tribe-green'
            : 'bg-tribe-green text-slate-900 hover:opacity-90'
        }`}
      >
        {d.followState.isFollowing ? (lang === 'es' ? 'Siguiendo' : 'Following') : lang === 'es' ? 'Seguir' : 'Follow'}
      </button>
      {isOwn && (
        <button
          onClick={async () => {
            const copied = await copyToClipboard(getInstructorShareUrl(instructorId));
            if (copied) showSuccess(lang === 'es' ? 'Enlace de perfil copiado!' : 'Profile link copied!');
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-theme-surface text-theme-secondary hover:text-theme-primary border border-theme transition-colors"
        >
          <Share2 className="w-4 h-4" />
          {lang === 'es' ? 'Compartir Perfil' : 'Share Profile'}
        </button>
      )}
      {d.partnerData && d.partnerInstructors.length > 0 && (
        <PartnerInstructorRoster instructors={d.partnerInstructors} language={language} />
      )}
      {canBook && (
        <button
          onClick={goToSessions}
          className="hidden md:flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm hover:opacity-90 transition"
        >
          <CalendarCheck className="w-4 h-4" />
          {lang === 'es' ? 'Reservar una sesión' : 'Book a session'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-theme-page pb-32 md:pb-12">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-header border-b border-theme">
        <div className="max-w-5xl mx-auto h-14 flex items-center px-4">
          <button
            onClick={() => window.history.back()}
            className="text-theme-primary hover:text-tribe-green transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="flex-1 text-center text-theme-primary font-semibold truncate px-2">{instructor.name}</h2>
          <div className="w-6" />
        </div>
      </div>

      <main className="pt-header max-w-5xl mx-auto">
        <StorefrontHero instructor={instructor} language={lang} />

        <div className="px-4 md:px-6 mt-4 md:hidden">
          <StorefrontTrustBar instructor={instructor} sessions={d.sessions} language={lang} orientation="horizontal" />
        </div>

        <div className="md:grid md:grid-cols-[280px_1fr] md:gap-6 px-4 md:px-6 mt-4">
          {/* Sidebar (desktop) / stacked profile (mobile) */}
          <aside className="md:sticky md:top-20 md:self-start space-y-4">
            <div className="hidden md:block">
              <StorefrontTrustBar
                instructor={instructor}
                sessions={d.sessions}
                language={lang}
                orientation="vertical"
              />
            </div>
            {profileColumn}
          </aside>

          {/* Content */}
          <section className="mt-4 md:mt-0">
            <div
              id="storefront-tabs"
              className="sticky top-[calc(env(safe-area-inset-top,0px)+3.5rem)] z-30 bg-theme-page py-2"
            >
              {tabs.length > 0 && <StorefrontTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />}
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
      </main>

      {/* Sticky bottom CTA (mobile only) */}
      {canBook && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 px-4 pb-2 safe-area-bottom pointer-events-none">
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
