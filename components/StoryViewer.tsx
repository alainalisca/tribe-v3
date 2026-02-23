'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';
import Link from 'next/link';

interface Story {
  id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
}

interface StoryGroup {
  sessionId: string;
  sport: string;
  stories: Story[];
}

interface StoryViewerProps {
  groups: StoryGroup[];
  startGroupIndex: number;
  currentUserId?: string | null;
  onClose: () => void;
  onStorySeen: (ids: string[]) => void;
  onStoryDeleted?: () => void;
}

function timeAgo(dateStr: string, lang: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);

  if (mins < 1) return lang === 'es' ? 'ahora' : 'just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function StoryViewer({ groups: initialGroups, startGroupIndex, currentUserId, onClose, onStorySeen, onStoryDeleted }: StoryViewerProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const [groups, setGroups] = useState(initialGroups);
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const elapsedRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef(0);
  const DURATION = 5000; // 5s for images

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isOwnStory = currentUserId && story?.user_id === currentUserId;

  // Mark current story as seen
  useEffect(() => {
    if (story) {
      onStorySeen([story.id]);
    }
  }, [story?.id]);

  // Lock body scroll
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const goNext = useCallback(() => {
    if (!group) return;
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(storyIdx + 1);
      setProgress(0);
      elapsedRef.current = 0;
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(groupIdx + 1);
      setStoryIdx(0);
      setProgress(0);
      elapsedRef.current = 0;
    } else {
      onClose();
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(storyIdx - 1);
      setProgress(0);
      elapsedRef.current = 0;
    } else if (groupIdx > 0) {
      setGroupIdx(groupIdx - 1);
      const prevGroup = groups[groupIdx - 1];
      setStoryIdx(prevGroup.stories.length - 1);
      setProgress(0);
      elapsedRef.current = 0;
    }
  }, [storyIdx, groupIdx, groups]);

  // Auto-advance timer for images
  useEffect(() => {
    if (!story || story.media_type === 'video' || paused || showDeleteConfirm) {
      return;
    }

    // Reset before starting — eliminates race with a separate reset effect
    elapsedRef.current = 0;
    setProgress(0);
    startTimeRef.current = Date.now();

    const animate = () => {
      if (paused || showDeleteConfirm) return;
      const now = Date.now();
      const totalElapsed = elapsedRef.current + (now - startTimeRef.current);
      const pct = Math.min(totalElapsed / DURATION, 1);
      setProgress(pct);
      if (pct >= 1) {
        goNext();
      } else {
        timerRef.current = requestAnimationFrame(animate);
      }
    };

    timerRef.current = requestAnimationFrame(animate);
    return () => {
      if (timerRef.current) cancelAnimationFrame(timerRef.current);
      elapsedRef.current += Date.now() - startTimeRef.current;
    };
  }, [story?.id, paused, showDeleteConfirm, goNext]);

  // Video progress tracking
  useEffect(() => {
    if (!story || story.media_type !== 'video') return;
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      if (video.duration) {
        setProgress(video.currentTime / video.duration);
      }
    };
    const onEnded = () => goNext();

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
    };
  }, [story?.id, goNext]);

  // Pause/resume video when paused state changes or delete confirm shown
  useEffect(() => {
    if (story?.media_type !== 'video' || !videoRef.current) return;
    if (paused || showDeleteConfirm) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [paused, showDeleteConfirm, story?.id]);

  async function handleDeleteStory() {
    if (!story) return;
    setDeleting(true);

    try {
      // Extract storage path from the media URL
      // URL format: .../storage/v1/object/public/session-stories/{sessionId}/{userId}/{filename}
      const urlPath = new URL(story.media_url).pathname;
      const bucketPrefix = '/storage/v1/object/public/session-stories/';
      const storagePath = urlPath.startsWith(bucketPrefix)
        ? urlPath.slice(bucketPrefix.length)
        : null;

      // Delete the file from storage
      if (storagePath) {
        await supabase.storage.from('session-stories').remove([decodeURIComponent(storagePath)]);
        // Also delete thumbnail if it exists
        if (story.thumbnail_url) {
          const thumbPath = new URL(story.thumbnail_url).pathname;
          const thumbStoragePath = thumbPath.startsWith(bucketPrefix)
            ? thumbPath.slice(bucketPrefix.length)
            : null;
          if (thumbStoragePath) {
            await supabase.storage.from('session-stories').remove([decodeURIComponent(thumbStoragePath)]);
          }
        }
      }

      // Delete the row from session_stories
      const { error } = await supabase
        .from('session_stories')
        .delete()
        .eq('id', story.id);

      if (error) throw error;

      showSuccess(language === 'es' ? 'Historia eliminada' : 'Story deleted');
      setShowDeleteConfirm(false);
      onStoryDeleted?.();

      // Remove from local state and navigate
      const updatedStories = group.stories.filter(s => s.id !== story.id);

      if (updatedStories.length === 0) {
        // No more stories in this group
        const updatedGroups = groups.filter((_, i) => i !== groupIdx);
        if (updatedGroups.length === 0) {
          onClose();
          return;
        }
        setGroups(updatedGroups);
        const newGroupIdx = Math.min(groupIdx, updatedGroups.length - 1);
        setGroupIdx(newGroupIdx);
        setStoryIdx(0);
      } else {
        // Update group with remaining stories
        const updatedGroups = groups.map((g, i) =>
          i === groupIdx ? { ...g, stories: updatedStories } : g
        );
        setGroups(updatedGroups);
        const newStoryIdx = Math.min(storyIdx, updatedStories.length - 1);
        setStoryIdx(newStoryIdx);
      }

      elapsedRef.current = 0;
      setProgress(0);
    } catch (error: any) {
      console.error('Error deleting story:', error);
      showError(language === 'es' ? 'Error al eliminar' : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  function handleTap(e: React.MouseEvent | React.TouchEvent) {
    if (showDeleteConfirm) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let clientX: number;
    if ('touches' in e) {
      return;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }
    const third = rect.width / 3;
    const relativeX = clientX - rect.left;
    if (relativeX < third) {
      goPrev();
    } else if (relativeX > third * 2) {
      goNext();
    }
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (showDeleteConfirm) return;
    touchStartY.current = e.touches[0].clientY;
    setPaused(true);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (showDeleteConfirm) return;
    setPaused(false);
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY.current;

    if (diffY > 100) {
      onClose();
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = e.changedTouches[0].clientX;
    const third = rect.width / 3;
    const relativeX = clientX - rect.left;
    if (relativeX < third) {
      goPrev();
    } else if (relativeX > third * 2) {
      goNext();
    }
  }

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 bg-black z-[70] flex flex-col">
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 px-2 pt-2 safe-area-top">
        <div className="flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-tribe-green rounded-full transition-none"
                style={{
                  width: `${
                    i < storyIdx ? 100 :
                    i === storyIdx ? progress * 100 :
                    0
                  }%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* User info */}
        <div className="flex items-center gap-3 mt-3 px-1">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-600 flex items-center justify-center flex-shrink-0">
            {story.user_avatar ? (
              <img src={story.user_avatar} alt="" className="w-full h-full object-cover" />
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
                onClick={() => { setPaused(true); setShowDeleteConfirm(true); }}
                className="p-1.5 hover:bg-white/10 rounded-full transition"
              >
                <Trash2 className="w-5 h-5 text-white/70" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-full transition"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Media */}
      <div
        className="flex-1 flex items-center justify-center"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={() => { if (!showDeleteConfirm) setPaused(true); }}
        onMouseUp={() => { if (!showDeleteConfirm) setPaused(false); }}
        onMouseLeave={() => { if (!showDeleteConfirm) setPaused(false); }}
      >
        {!story.media_url ? (
          <div className="w-full h-full flex items-center justify-center bg-stone-800">
            <p className="text-white/60">{language === 'es' ? 'Medio no disponible' : 'Media unavailable'}</p>
          </div>
        ) : story.media_type === 'image' ? (
          <img
            key={story.id}
            src={story.media_url}
            alt=""
            className="w-full h-full object-cover select-none"
            draggable={false}
            onError={(e) => {
              console.error('Story image failed to load:', story.media_url);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <video
            key={story.id}
            ref={videoRef}
            src={story.media_url}
            className="w-full h-full object-cover"
            playsInline
            autoPlay
            muted={false}
            onError={() => {
              console.error('Story video failed to load:', story.media_url);
            }}
          />
        )}
      </div>

      {/* Bottom overlay: caption + view session */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-6 pt-16">
        {story.caption && (
          <p className="text-white text-sm mb-3 leading-relaxed">{story.caption}</p>
        )}
        <Link
          href={`/session/${group.sessionId}`}
          onClick={onClose}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white text-sm font-semibold rounded-full hover:bg-white/30 transition border border-white/20"
        >
          {language === 'es' ? 'Ver Sesión' : 'View Session'}
        </Link>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60">
          <div className="bg-white dark:bg-[#2C3137] rounded-2xl p-6 mx-6 max-w-sm w-full">
            <p className="text-lg font-bold text-theme-primary text-center mb-4">
              {language === 'es' ? '¿Eliminar esta historia?' : 'Delete this story?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setPaused(false); }}
                disabled={deleting}
                className="flex-1 py-3 bg-stone-200 dark:bg-[#3D4349] text-theme-primary font-semibold rounded-xl hover:bg-stone-300 dark:hover:bg-[#52575D] transition"
              >
                {language === 'es' ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteStory}
                disabled={deleting}
                className="flex-1 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {language === 'es' ? 'Eliminar' : 'Delete'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
