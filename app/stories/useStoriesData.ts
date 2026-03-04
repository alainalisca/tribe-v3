'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { logError } from '@/lib/logger';
import { fetchAllActiveStories } from '@/lib/dal';
import type { User } from '@supabase/supabase-js';
import type { Story, StoryGroup } from './types';

export function useStoriesData() {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [allStories, setAllStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [StoryViewerComp, setStoryViewerComp] = useState<React.ComponentType<{
    groups: StoryGroup[];
    startGroupIndex: number;
    currentUserId?: string | null;
    onClose: () => void;
    onStorySeen: (ids: string[]) => void;
    onStoryDeleted?: () => void;
  }> | null>(null);

  // Lazy-load StoryViewer to avoid potential import issues
  useEffect(() => {
    import('@/components/StoryViewer')
      .then((mod) => {
        setStoryViewerComp(() => mod.default);
      })
      .catch((err) => {
        logError(err, { action: 'loadStoryViewer' });
      });
  }, []);

  // Lazy-load markStoriesSeen
  const markStoriesSeen = (ids: string[]) => {
    try {
      const raw = localStorage.getItem('tribe_seen_stories');
      const seen = new Set(raw ? JSON.parse(raw) : []);
      ids.forEach((id) => seen.add(id));
      const arr = [...seen].slice(-500);
      localStorage.setItem('tribe_seen_stories', JSON.stringify(arr));
    } catch {
      // localStorage write is best-effort; missing seen-state is harmless
    }
  };

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if (user) loadStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [user]);

  async function checkUser() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
      } else {
        setUser(user);
      }
    } catch (err) {
      logError(err, { action: 'checkUser' });
      router.push('/auth');
    }
  }

  async function loadStories() {
    try {
      const result = await fetchAllActiveStories(supabase);

      if (!result.success) {
        logError(result.error, { action: 'loadStories' });
        setGroups([]);
        setAllStories([]);
        return;
      }

      // REASON: DAL returns unknown[] — cast for field access on story rows with user/session joins
      const data = (result.data || []) as Array<{
        id: string;
        session_id: string;
        user_id: string;
        media_url: string;
        media_type: string;
        thumbnail_url: string | null;
        caption: string | null;
        created_at: string;
        user: Record<string, string | null> | null;
        session: Record<string, string | null> | null;
      }>;

      if (data.length === 0) {
        setGroups([]);
        setAllStories([]);
        return;
      }

      // Build flat list for the grid
      const flat: Story[] = [];
      for (const row of data) {
        try {
          flat.push({
            id: row.id,
            media_url: row.media_url || '',
            media_type: (row.media_type === 'video' ? 'video' : 'image') as 'image' | 'video',
            thumbnail_url: row.thumbnail_url || null,
            caption: row.caption || null,
            created_at: row.created_at || '',
            user_id: row.user_id || '',
            user_name: row.user?.name || '?',
            user_avatar: row.user?.avatar_url || null,
            sessionId: row.session_id || '',
            sport: row.session?.sport || '?',
          });
        } catch {
          // Skip malformed rows
        }
      }
      setAllStories(flat);

      // Group by session_id for the StoryViewer
      const map = new Map<string, StoryGroup>();
      for (const story of flat) {
        if (!story.sessionId) continue;
        if (!map.has(story.sessionId)) {
          map.set(story.sessionId, {
            sessionId: story.sessionId,
            sport: story.sport,
            stories: [],
          });
        }
        map.get(story.sessionId)!.stories.push(story);
      }

      const grouped = [...map.values()];
      for (const g of grouped) {
        g.stories.sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return ta - tb;
        });
      }
      setGroups(grouped);
    } catch (err) {
      logError(err, { action: 'loadStories' });
      setGroups([]);
      setAllStories([]);
    } finally {
      setLoading(false);
    }
  }

  function openStoryViewer(story: Story) {
    const groupIdx = groups.findIndex((g) => g.sessionId === story.sessionId);
    if (groupIdx >= 0) {
      setViewerStartIndex(groupIdx);
      setViewerOpen(true);
    }
  }

  return {
    user,
    groups,
    allStories,
    loading,
    viewerOpen,
    setViewerOpen,
    viewerStartIndex,
    StoryViewerComp,
    markStoriesSeen,
    openStoryViewer,
    loadStories,
  };
}
