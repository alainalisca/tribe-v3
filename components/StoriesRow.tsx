'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { Plus } from 'lucide-react';
import StoryViewer from './StoryViewer';

interface SessionStoryGroup {
  sessionId: string;
  sport: string;
  stories: {
    id: string;
    media_url: string;
    media_type: 'image' | 'video';
    thumbnail_url: string | null;
    caption: string | null;
    created_at: string;
    user_id: string;
    user_name: string;
    user_avatar: string | null;
  }[];
}

function getSeenStories(): Set<string> {
  try {
    const raw = localStorage.getItem('tribe_seen_stories');
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function markStoriesSeen(ids: string[]) {
  const seen = getSeenStories();
  ids.forEach(id => seen.add(id));
  // Keep only last 500 to avoid localStorage bloat
  const arr = [...seen].slice(-500);
  localStorage.setItem('tribe_seen_stories', JSON.stringify(arr));
}

const CACHE_KEY = 'tribe_stories_cache';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCachedStories(): SessionStoryGroup[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as SessionStoryGroup[];
  } catch {
    return null;
  }
}

function setCachedStories(data: SessionStoryGroup[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

interface StoriesRowProps {
  userId: string | null;
  userAvatar?: string | null;
}

export default function StoriesRow({ userId, userAvatar }: StoriesRowProps) {
  const supabase = createClient();
  const router = useRouter();
  const { language } = useLanguage();
  const [groups, setGroups] = useState<SessionStoryGroup[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
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
    if (userId) loadLatestSession();
  }, [userId]);

  async function loadLatestSession() {
    if (!userId) return;

    // Find the user's most recent joined or created session
    const { data: created } = await supabase
      .from('sessions')
      .select('id, date, start_time')
      .eq('creator_id', userId)
      .eq('status', 'active')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(1);

    const { data: joined } = await supabase
      .from('session_participants')
      .select('session_id, sessions!inner(id, date, start_time, status)')
      .eq('user_id', userId)
      .eq('sessions.status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    const createdSession = created?.[0];
    const joinedSession = (joined as any)?.[0]?.sessions;

    if (createdSession && joinedSession) {
      const cDate = createdSession.date + 'T' + (createdSession.start_time || '00:00');
      const jDate = joinedSession.date + 'T' + (joinedSession.start_time || '00:00');
      setLatestSessionId(cDate >= jDate ? createdSession.id : joinedSession.id);
    } else if (createdSession) {
      setLatestSessionId(createdSession.id);
    } else if (joinedSession) {
      setLatestSessionId(joinedSession.id);
    }
  }

  async function loadStories() {
    try {
      const { data, error } = await supabase
        .from('session_stories')
        .select(`
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
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading stories:', error);
        return;
      }

      if (!data || data.length === 0) {
        setGroups([]);
        setCachedStories([]);
        setLoaded(true);
        return;
      }

      // Group by session_id
      const map = new Map<string, SessionStoryGroup>();
      for (const row of data) {
        const sid = row.session_id;
        const user = row.user as any;
        const session = row.session as any;
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

      // Sort stories within each group chronologically (oldest first for playback)
      const grouped = [...map.values()];
      for (const g of grouped) {
        g.stories.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }

      setGroups(grouped);
      setCachedStories(grouped);
    } catch (err) {
      console.error('Error in loadStories:', err);
    } finally {
      setLoaded(true);
    }
  }

  function handleStoryViewed(storyIds: string[]) {
    markStoriesSeen(storyIds);
    setSeenIds(getSeenStories());
  }

  function openViewer(groupIndex: number) {
    setViewerStartIndex(groupIndex);
    setViewerOpen(true);
  }

  // Don't render anything until loaded, and hide if no stories and no user "+" circle
  if (!loaded) return null;
  if (groups.length === 0 && !userId) return null;

  const hasUnseen = (group: SessionStoryGroup) =>
    group.stories.some(s => !seenIds.has(s.id));

  function truncate(text: string, max: number) {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  return (
    <>
      <div className="mb-4 -mx-4 px-4">
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style jsx>{`div::-webkit-scrollbar { display: none; }`}</style>

          {/* Current user's "+" circle */}
          {userId && (
            <button
              onClick={() => {
                if (latestSessionId) {
                  router.push(`/session/${latestSessionId}`);
                } else {
                  router.push('/sessions');
                }
              }}
              className="flex-shrink-0 flex flex-col items-center gap-1 w-[68px]"
            >
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-2 border-stone-300 dark:border-gray-500 overflow-hidden bg-stone-200 dark:bg-[#3D4349] flex items-center justify-center">
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-bold text-stone-500">?</span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-tribe-green rounded-full flex items-center justify-center border-2 border-white dark:border-[#52575D]">
                  <Plus className="w-3 h-3 text-slate-900" strokeWidth={3} />
                </div>
              </div>
              <span className="text-[10px] text-theme-secondary text-center leading-tight truncate w-full">
                {language === 'es' ? 'Tu historia' : 'Your story'}
              </span>
            </button>
          )}

          {/* Session story circles */}
          {groups.map((group, i) => {
            const firstStory = group.stories[0];
            const unseen = hasUnseen(group);
            return (
              <button
                key={group.sessionId}
                onClick={() => openViewer(i)}
                className="flex-shrink-0 flex flex-col items-center gap-1 w-[68px]"
              >
                <div
                  className={`w-14 h-14 rounded-full p-[2.5px] ${
                    unseen
                      ? 'bg-gradient-to-br from-tribe-green to-lime-400'
                      : 'bg-stone-300 dark:bg-gray-500'
                  }`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-[#3D4349] flex items-center justify-center">
                    {firstStory.user_avatar ? (
                      <img src={firstStory.user_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-stone-500">
                        {firstStory.user_name[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-theme-secondary text-center leading-tight truncate w-full">
                  {truncate(group.sport, 8)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerStartIndex}
          onClose={() => setViewerOpen(false)}
          onStorySeen={handleStoryViewed}
        />
      )}
    </>
  );
}
