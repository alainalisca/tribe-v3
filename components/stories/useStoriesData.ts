'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import { fetchSessionsByCreator, fetchAllActiveStories, fetchJoinedSessionsWithDetails } from '@/lib/dal';
import type { StoryGroup, ActiveSession } from './storyTypes';
import {
  getSeenStories,
  markStoriesSeen as markStoriesSeenHelper,
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

    const createdResult = await fetchSessionsByCreator(supabase, userId, {
      fields: 'id, sport, date, start_time, location, status',
    });
    // REASON: DAL returns unknown[] — cast for field access on session rows
    const allCreated = (createdResult.success ? createdResult.data : []) as Array<ActiveSession & { status?: string }>;
    const created = allCreated.filter((s) => s.status === 'active').sort((a, b) => b.date.localeCompare(a.date));

    const joinedResult = await fetchJoinedSessionsWithDetails(supabase, userId);
    // REASON: DAL returns unknown[] — cast for field access on joined session rows
    const joined = (joinedResult.success ? joinedResult.data : []) as Array<{ sessions: ActiveSession | null }>;

    const sessionsMap = new Map<string, ActiveSession>();

    for (const s of created) {
      sessionsMap.set(s.id, s);
    }

    for (const row of joined) {
      const s = row.sessions;
      if (s && !sessionsMap.has(s.id)) {
        sessionsMap.set(s.id, s);
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
      const result = await fetchAllActiveStories(supabase);

      if (!result.success) {
        logError(result.error, { action: 'loadStories' });
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
        user: { name: string; avatar_url: string | null } | null;
        session: { sport: string } | null;
      }>;

      if (data.length === 0) {
        setGroups([]);
        setCachedStories([]);
        setLoaded(true);
        return;
      }

      const map = new Map<string, StoryGroup>();
      for (const row of data) {
        const sid = row.session_id;
        if (!map.has(sid)) {
          map.set(sid, {
            sessionId: sid,
            sport: row.session?.sport || '?',
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
          user_name: row.user?.name || '?',
          user_avatar: row.user?.avatar_url || null,
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
    markStoriesSeenHelper(storyIds);
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
