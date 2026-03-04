'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import type { StoryGroup, ActiveSession } from './storyTypes';
import {
  getSeenStories,
  markStoriesSeen,
  getCachedStories,
  setCachedStories,
  clearStoriesCache,
} from './storiesRowHelpers';

interface UseStoriesDataProps {
  userId: string | null;
}

export function useStoriesData({ userId }: UseStoriesDataProps) {
  const supabase = createClient();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = getCachedStories();
    if (cached) {
      setGroups(cached);
      setLoaded(true);
    } else {
      loadStories();
    }
    setSeenIds(getSeenStories());
    if (userId) loadActiveSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [userId]);

  async function loadActiveSessions() {
    if (!userId) return;

    const { data: created } = await supabase
      .from('sessions')
      .select('id, sport, date, start_time, location')
      .eq('creator_id', userId)
      .eq('status', 'active')
      .order('date', { ascending: false });

    const { data: joined } = await supabase
      .from('session_participants')
      .select('session_id, sessions!inner(id, sport, date, start_time, location, status)')
      .eq('user_id', userId)
      .eq('sessions.status', 'active');

    const sessionsMap = new Map<string, ActiveSession>();

    if (created) {
      for (const s of created) {
        sessionsMap.set(s.id, s);
      }
    }

    if (joined) {
      for (const row of joined) {
        const s = (row as unknown as { sessions: ActiveSession | null }).sessions;
        if (s && !sessionsMap.has(s.id)) {
          sessionsMap.set(s.id, s);
        }
      }
    }

    const all = [...sessionsMap.values()].sort((a, b) => {
      const dateA = a.date + 'T' + (a.start_time || '00:00');
      const dateB = b.date + 'T' + (b.start_time || '00:00');
      return dateB.localeCompare(dateA);
    });

    setActiveSessions(all);
  }

  async function loadStories() {
    try {
      const { data, error } = await supabase
        .from('session_stories')
        .select(
          `
          id,
          session_id,
          user_id,
          media_url,
          media_type,
          thumbnail_url,
          caption,
          created_at,
          user:users!session_stories_user_id_fkey(name, avatar_url),
          session:sessions!session_stories_session_id_fkey(sport)
        `
        )
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        logError(error, { action: 'loadStories' });
        return;
      }

      if (!data || data.length === 0) {
        setGroups([]);
        setCachedStories([]);
        setLoaded(true);
        return;
      }

      const map = new Map<string, StoryGroup>();
      for (const row of data) {
        const sid = row.session_id;
        const user = row.user as unknown as { name: string; avatar_url: string | null } | null;
        const session = row.session as unknown as { sport: string } | null;
        if (!map.has(sid)) {
          map.set(sid, {
            sessionId: sid,
            sport: session?.sport || '?',
            stories: [],
          });
        }
        map.get(sid)!.stories.push({
          id: row.id,
          media_url: row.media_url,
          media_type: row.media_type as 'image' | 'video',
          thumbnail_url: row.thumbnail_url,
          caption: row.caption,
          created_at: row.created_at,
          user_id: row.user_id,
          user_name: user?.name || '?',
          user_avatar: user?.avatar_url || null,
        });
      }

      const grouped = [...map.values()];
      for (const g of grouped) {
        g.stories.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setGroups(grouped);
      setCachedStories(grouped);
    } catch (err) {
      logError(err, { action: 'loadStories' });
    } finally {
      setLoaded(true);
    }
  }

  function refreshStories() {
    clearStoriesCache();
    loadStories();
  }

  function handleStoryViewed(storyIds: string[]) {
    markStoriesSeen(storyIds);
    setSeenIds(getSeenStories());
  }

  return {
    groups,
    seenIds,
    activeSessions,
    loaded,
    refreshStories,
    handleStoryViewed,
  };
}
