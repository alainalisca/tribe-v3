'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Play, Heart, Eye } from 'lucide-react';
import StorefrontSessionCard from '@/components/storefront/StorefrontSessionCard';
import StorefrontPackageCard from '@/components/storefront/StorefrontPackageCard';
import StorefrontProductsSection from '@/components/products/StorefrontProductsSection';
import ReviewsList from '@/components/instructor/ReviewsList';
import ProfileLightbox from '@/app/profile/[userId]/ProfileLightbox';
import type { Session, ServicePackage, StorefrontMedia, InstructorPost } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontTabPanelsProps {
  activeTab: string;
  language: 'en' | 'es';
  instructorId: string;
  currentUserId: string | null;
  sessions: Session[];
  packages: ServicePackage[];
  media: StorefrontMedia[];
  posts: InstructorPost[];
  likedPosts: Set<string>;
  joinedSessionIds: Set<string>;
  onSessionJoined: (id: string) => void;
  onPostLike: (id: string) => void;
}

function timeAgo(dateString: string, language: 'en' | 'es') {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return language === 'es' ? 'Ahora' : 'Now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${language === 'es' ? 'atrás' : 'ago'}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${language === 'es' ? 'atrás' : 'ago'}`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ${language === 'es' ? 'atrás' : 'ago'}`;
  return `${Math.floor(seconds / 2592000)}mo ${language === 'es' ? 'atrás' : 'ago'}`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10">
      <p className="text-sm text-theme-secondary">{text}</p>
    </div>
  );
}

/** Renders only the active tab's panel (spec 6C). Theme tokens only. */
export default function StorefrontTabPanels(props: StorefrontTabPanelsProps) {
  const {
    activeTab,
    language,
    instructorId,
    currentUserId,
    sessions,
    packages,
    media,
    posts,
    likedPosts,
    joinedSessionIds,
    onSessionJoined,
    onPostLike,
  } = props;

  // Media lightbox: index into the image-only subset (see the media panel below).
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const t = {
    noSessions: language === 'es' ? 'No hay sesiones disponibles' : 'No sessions available',
    noPackages: language === 'es' ? 'Sin paquetes' : 'No packages',
    noMedia: language === 'es' ? 'Sin medios' : 'No media',
    noPosts: language === 'es' ? 'Sin publicaciones' : 'No posts',
  };

  if (activeTab === 'sessions') {
    return sessions.length > 0 ? (
      <div className="space-y-3">
        {sessions.map((session) => (
          <StorefrontSessionCard
            key={session.id}
            session={session}
            language={language}
            currentUserId={currentUserId}
            joinedSessionIds={joinedSessionIds}
            onJoined={onSessionJoined}
          />
        ))}
      </div>
    ) : (
      <EmptyState text={t.noSessions} />
    );
  }

  if (activeTab === 'products') {
    return <StorefrontProductsSection instructorId={instructorId} isOwnProfile={currentUserId === instructorId} />;
  }

  if (activeTab === 'packages') {
    return packages.length > 0 ? (
      <div className="space-y-3">
        {packages.map((pkg) => (
          <StorefrontPackageCard key={pkg.id} pkg={pkg} language={language} instructorId={instructorId} />
        ))}
      </div>
    ) : (
      <EmptyState text={t.noPackages} />
    );
  }

  if (activeTab === 'media') {
    if (media.length === 0) return <EmptyState text={t.noMedia} />;
    // The tiles were non-interactive divs (a cosmetic cursor-pointer only), so
    // tapping a photo did nothing while the profile page had a lightbox. Reuse
    // that same ProfileLightbox for image tiles. Videos can't render in an
    // <img> lightbox, so they open in a new tab; a dedicated video lightbox is
    // a separate enhancement. lightboxIndex indexes this image-only list.
    const imageUrls = media.filter((m) => m.media_type !== 'video').map((m) => m.url);
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {media.map((item) => {
            const isVideo = item.media_type === 'video';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isVideo) {
                    window.open(item.url, '_blank', 'noopener,noreferrer');
                  } else {
                    setLightboxIndex(imageUrls.indexOf(item.url));
                  }
                }}
                aria-label={
                  isVideo
                    ? language === 'es'
                      ? 'Reproducir video'
                      : 'Play video'
                    : language === 'es'
                      ? 'Ver imagen'
                      : 'View image'
                }
                className="relative aspect-square rounded-2xl overflow-hidden bg-theme-surface group cursor-pointer border border-theme"
              >
                <Image
                  src={item.url}
                  alt=""
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  unoptimized
                />
                {isVideo && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-all">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {lightboxIndex !== null && imageUrls[lightboxIndex] && (
          <ProfileLightbox
            photo={imageUrls[lightboxIndex]}
            photos={imageUrls}
            lightboxIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={(index) => setLightboxIndex(index)}
          />
        )}
      </>
    );
  }

  if (activeTab === 'posts') {
    return posts.length > 0 ? (
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.id} className="bg-theme-card rounded-2xl border border-theme p-4">
            <p className="text-theme-primary mb-3 text-sm leading-relaxed">{post.content}</p>
            {post.media_url && (
              <div className="relative aspect-video rounded-xl overflow-hidden mb-3 bg-theme-surface group border border-theme">
                <Image
                  src={post.media_url}
                  alt=""
                  fill
                  className="object-cover group-hover:scale-105 transition-transform"
                  unoptimized
                />
                {post.media_type === 'video' && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-all">
                    <Play className="w-10 h-10 text-white fill-white" />
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-theme-secondary pt-3 border-t border-theme">
              <div className="flex gap-3">
                <button
                  onClick={() => onPostLike(post.id)}
                  className="flex items-center gap-1 hover:text-tribe-green transition-colors"
                >
                  <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? 'fill-red-500 text-red-500' : ''}`} />
                  <span>{post.likes_count}</span>
                </button>
                <div className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  <span>{post.views_count}</span>
                </div>
              </div>
              <span>{timeAgo(post.created_at, language)}</span>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState text={t.noPosts} />
    );
  }

  if (activeTab === 'reviews') {
    return <ReviewsList hostId={instructorId} showAll language={language} />;
  }

  return null;
}
