'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { deleteSessionStory } from '@/lib/dal';
import type { StoryGroup } from './storyTypes';

const DURATION = 5000; // 5s for images

interface UseStoryViewerStateProps {
  initialGroups: StoryGroup[];
  startGroupIndex: number;
  currentUserId?: string | null;
  onClose: () => void;
  onStorySeen: (ids: string[]) => void;
  onStoryDeleted?: () => void;
}

export function useStoryViewerState({
  initialGroups,
  startGroupIndex,
  currentUserId,
  onClose,
  onStorySeen,
  onStoryDeleted,
}: UseStoryViewerStateProps) {
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

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];
  const isOwnStory = currentUserId && story?.user_id === currentUserId;

  // Mark current story as seen
  useEffect(() => {
    if (story) {
      onStorySeen([story.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from currentIndex
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

    // Reset before starting
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from currentIndex
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from currentIndex
  }, [story?.id, goNext]);

  // Pause/resume video when paused state changes or delete confirm shown
  useEffect(() => {
    if (story?.media_type !== 'video' || !videoRef.current) return;
    if (paused || showDeleteConfirm) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from currentIndex
  }, [paused, showDeleteConfirm, story?.id]);

  async function handleDeleteStory() {
    if (!story || !group) return;
    setDeleting(true);

    try {
      const urlPath = new URL(story.media_url).pathname;
      const bucketPrefix = '/storage/v1/object/public/session-stories/';
      const storagePath = urlPath.startsWith(bucketPrefix) ? urlPath.slice(bucketPrefix.length) : null;

      if (storagePath) {
        await supabase.storage.from('session-stories').remove([decodeURIComponent(storagePath)]);
        if (story.thumbnail_url) {
          const thumbPath = new URL(story.thumbnail_url).pathname;
          const thumbStoragePath = thumbPath.startsWith(bucketPrefix) ? thumbPath.slice(bucketPrefix.length) : null;
          if (thumbStoragePath) {
            await supabase.storage.from('session-stories').remove([decodeURIComponent(thumbStoragePath)]);
          }
        }
      }

      const result = await deleteSessionStory(supabase, story.id);
      if (!result.success) throw new Error(result.error);

      showSuccess(language === 'es' ? 'Historia eliminada' : 'Story deleted');
      setShowDeleteConfirm(false);
      onStoryDeleted?.();

      const updatedStories = group.stories.filter((s) => s.id !== story.id);

      if (updatedStories.length === 0) {
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
        const updatedGroups = groups.map((g, i) => (i === groupIdx ? { ...g, stories: updatedStories } : g));
        setGroups(updatedGroups);
        const newStoryIdx = Math.min(storyIdx, updatedStories.length - 1);
        setStoryIdx(newStoryIdx);
      }

      elapsedRef.current = 0;
      setProgress(0);
    } catch (error: unknown) {
      logError(error, { action: 'handleDeleteStory', storyId: story.id });
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

  return {
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
  };
}
