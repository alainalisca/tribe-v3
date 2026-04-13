'use client';

import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';
import StoryViewer from './StoryViewer';
import { useStoriesData } from './stories/useStoriesData';
import { timeAgo } from './stories/storyTypes';
import type { StoryGroup } from './stories/storyTypes';

interface StoriesCarouselProps {
  language: string;
  userId: string | null;
}

const SPORT_ICONS: Record<string, string> = {
  running: '🏃',
  cycling: '🚴',
  hiking: '🥾',
  yoga: '🧘',
  crossfit: '💪',
  soccer: '⚽',
  swimming: '🏊',
  fitness: '🏋️',
};

export default function StoriesCarousel({ language, userId }: StoriesCarouselProps) {
  const { language: ctxLang } = useLanguage();
  const lang = (ctxLang || language) === 'es' ? 'es' : 'en';

  const { groups, seenIds, loaded, refreshStories, handleStoryViewed } = useStoriesData({ userId });
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Slow auto-scroll
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || groups.length <= 2) return;

    let animFrame: number;
    let scrollPos = 0;
    const speed = 0.3; // pixels per frame

    const el = container; // stable reference for closures

    function step() {
      scrollPos += speed;
      if (scrollPos >= el.scrollWidth - el.clientWidth) {
        scrollPos = 0;
      }
      el.scrollLeft = scrollPos;
      animFrame = requestAnimationFrame(step);
    }

    // Pause on hover / touch
    let paused = false;
    function pause() {
      paused = true;
      cancelAnimationFrame(animFrame);
    }
    function resume() {
      if (paused) {
        paused = false;
        scrollPos = el.scrollLeft;
        animFrame = requestAnimationFrame(step);
      }
    }

    animFrame = requestAnimationFrame(step);
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', resume);

    return () => {
      cancelAnimationFrame(animFrame);
      el.removeEventListener('pointerenter', pause);
      el.removeEventListener('pointerleave', resume);
    };
  }, [groups.length]);

  if (!loaded) return null;

  // Empty state
  if (groups.length === 0) {
    return (
      <section className="w-full bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4 space-y-3">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">
          {lang === 'es' ? '📹 Historias de la Comunidad' : '📹 Community Stories'}
        </h2>
        <div className="text-center py-6">
          <p className="text-stone-500 dark:text-gray-400 text-sm mb-3">
            {lang === 'es' ? 'Se el primero en compartir tu historia!' : 'Be the first to share your story!'}
          </p>
          <Link
            href="/create"
            className="inline-block px-4 py-2 bg-tribe-green-light text-tribe-dark font-semibold text-sm rounded-lg hover:bg-tribe-green-hover transition-colors"
          >
            {lang === 'es' ? 'Crear Sesion' : 'Create Session'}
          </Link>
        </div>
      </section>
    );
  }

  function openViewer(index: number) {
    setViewerStartIndex(index);
    setViewerOpen(true);
  }

  return (
    <section className="w-full bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4 space-y-3">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white">
        {lang === 'es' ? '📹 Historias de la Comunidad' : '📹 Community Stories'}
      </h2>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {groups.map((group, i) => (
          <StoryCard
            key={group.sessionId}
            group={group}
            lang={lang}
            unseen={group.stories.some((s) => !seenIds.has(s.id))}
            onClick={() => openViewer(i)}
          />
        ))}
      </div>

      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerStartIndex}
          currentUserId={userId}
          onClose={() => setViewerOpen(false)}
          onStorySeen={handleStoryViewed}
          onStoryDeleted={refreshStories}
        />
      )}
    </section>
  );
}

/* ── Story Card ── */

function StoryCard({
  group,
  lang,
  unseen,
  onClick,
}: {
  group: StoryGroup;
  lang: string;
  unseen: boolean;
  onClick: () => void;
}) {
  const firstStory = group.stories[0];
  const sportIcon = SPORT_ICONS[group.sport] || '🏋️';

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-32 h-44 rounded-xl overflow-hidden relative group shadow-md hover:shadow-lg transition-shadow"
    >
      {/* Background image or gradient */}
      {firstStory.thumbnail_url || firstStory.media_type === 'image' ? (
        <img
          src={firstStory.thumbnail_url || firstStory.media_url}
          alt={`${firstStory.user_name}'s story`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-tribe-green-light/30 to-tribe-surface" />
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* Unseen ring */}
      {unseen && (
        <div className="absolute top-1.5 left-1.5 w-3 h-3 rounded-full bg-tribe-green-light border-2 border-white" />
      )}

      {/* Sport tag */}
      <span className="absolute top-1.5 right-1.5 text-xs bg-black/40 text-white px-1.5 py-0.5 rounded-full">
        {sportIcon}
      </span>

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-2">
        <p className="text-xs font-semibold text-white line-clamp-1">{firstStory.user_name}</p>
        <p className="text-[10px] text-gray-300">{timeAgo(firstStory.created_at, lang)}</p>
      </div>
    </button>
  );
}
