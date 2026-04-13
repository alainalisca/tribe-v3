'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2 } from 'lucide-react';
import { log } from '@/lib/logger';
import Link from 'next/link';
import type { StoryGroup } from './stories/storyTypes';
import { timeAgo } from './stories/storyTypes';
import { useStoryViewerState } from './stories/useStoryViewerState';
import DeleteConfirmModal from './stories/DeleteConfirmModal';
import { useLanguage } from '@/lib/LanguageContext';

interface StoryViewerProps {
  groups: StoryGroup[];
  startGroupIndex: number;
  currentUserId?: string | null;
  onClose: () => void;
  onStorySeen: (ids: string[]) => void;
  onStoryDeleted?: () => void;
}

export default function StoryViewer({
  groups: initialGroups,
  startGroupIndex,
  currentUserId,
  onClose,
  onStorySeen,
  onStoryDeleted,
}: StoryViewerProps) {
  const { t } = useLanguage();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  const {
    language,
    group,
    story,
    storyIdx,
    progress,
    paused,
    setPaused,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deleting,
    isOwnStory,
    videoRef,
    handleDeleteStory,
    handleTap,
    handleTouchStart,
    handleTouchEnd,
    goNext,
    goPrev,
  } = useStoryViewerState({
    initialGroups,
    startGroupIndex,
    currentUserId,
    onClose,
    onStorySeen,
    onStoryDeleted,
  });

  // Keyboard navigation: ArrowLeft/Right/Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showDeleteConfirm) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteConfirm, goPrev, goNext, onClose]);

  if (!group || !story || !portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 bg-tribe-dark z-[70] flex items-center justify-center">
      <div className="relative w-full h-full max-w-[430px] md:h-[100vh] md:max-h-[100vh] flex flex-col">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 px-2 pt-2 safe-area-top">
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full bg-tribe-green rounded-full transition-none"
                  style={{
                    width: `${i < storyIdx ? 100 : i === storyIdx ? progress * 100 : 0}%`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 mt-3 px-1">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-600 flex items-center justify-center flex-shrink-0">
              {story.user_avatar ? (
                <img
                  src={story.user_avatar}
                  alt={`${story.user_name}'s avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-sm font-bold text-white">{story.user_name[0]?.toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-semibold truncate">{story.user_name}</span>
                <span className="text-white/60 text-xs flex-shrink-0">{timeAgo(story.created_at, language)}</span>
              </div>
              <span className="text-white/50 text-xs">{group.sport}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isOwnStory && (
                <button
                  onClick={() => {
                    setPaused(true);
                    setShowDeleteConfirm(true);
                  }}
                  aria-label="Delete story"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full transition"
                >
                  <Trash2 className="w-5 h-5 text-white/70" />
                </button>
              )}
              <button
                onClick={onClose}
                aria-label="Close story viewer"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/10 rounded-full transition"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Media */}
        <div
          className="flex-1 flex items-center justify-center overflow-hidden relative"
          onClick={handleTap}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={() => {
            if (!showDeleteConfirm) setPaused(true);
          }}
          onMouseUp={() => {
            if (!showDeleteConfirm) setPaused(false);
          }}
          onMouseLeave={() => {
            if (!showDeleteConfirm) setPaused(false);
          }}
        >
          {/* Loading spinner — sits behind media, visible until image/video covers it */}
          {story.media_url && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-3 border-white/20 border-t-white/80 rounded-full animate-spin" />
            </div>
          )}
          {!story.media_url ? (
            <div className="w-full h-full flex items-center justify-center bg-stone-800">
              <p className="text-white/60">{t('mediaUnavailable')}</p>
            </div>
          ) : story.media_type === 'image' ? (
            <img
              key={story.id}
              src={story.media_url}
              alt={`Story by ${story.user_name}`}
              className="w-full h-full object-cover md:object-contain select-none relative z-[1]"
              draggable={false}
              onError={(e) => {
                log('error', 'Story image failed to load', { action: 'StoryViewer', mediaUrl: story.media_url });
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <video
              key={story.id}
              ref={videoRef}
              src={story.media_url}
              className="w-full h-full object-cover md:object-contain relative z-[1]"
              playsInline
              autoPlay
              muted
              onError={() => {
                log('error', 'Story video failed to load', { action: 'StoryViewer', mediaUrl: story.media_url });
              }}
            />
          )}
        </div>

        {/* Navigation arrows — visible on desktop, hidden on mobile (tap zones handle it) */}
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-30 min-w-[44px] min-h-[44px] rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 hover:opacity-100 md:opacity-50 md:hover:opacity-100 transition-opacity"
          aria-label="Previous story"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 min-w-[44px] min-h-[44px] rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center opacity-0 hover:opacity-100 md:opacity-50 md:hover:opacity-100 transition-opacity"
          aria-label="Next story"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Bottom overlay: caption + view session */}
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-6 pt-16">
          {story.caption && <p className="text-white text-sm mb-3 leading-relaxed">{story.caption}</p>}
          <Link
            href={`/session/${group.sessionId}`}
            onClick={onClose}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white text-sm font-semibold rounded-full hover:bg-white/30 transition border border-white/20"
          >
            {t('viewSession')}
          </Link>
        </div>

        {/* Delete confirmation modal */}
        {showDeleteConfirm && (
          <DeleteConfirmModal
            language={language}
            deleting={deleting}
            onCancel={() => {
              setShowDeleteConfirm(false);
              setPaused(false);
            }}
            onConfirm={handleDeleteStory}
          />
        )}
      </div>
    </div>,
    portalTarget
  );
}
