'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { Plus, X, MapPin, Calendar } from 'lucide-react';
import { showInfo } from '@/lib/toast';
import { sportTranslations } from '@/lib/translations';
import StoryViewer from './StoryViewer';
import StoryUpload from './StoryUpload';

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

function getSportEmoji(sport: string): string {
  const map: Record<string, string> = {
    Running: '\u{1F3C3}', Cycling: '\u{1F6B4}', Swimming: '\u{1F3CA}', CrossFit: '\u{1F3CB}\uFE0F',
    Boxing: '\u{1F94A}', 'Jiu-Jitsu': '\u{1F94B}', Soccer: '\u26BD', Basketball: '\u{1F3C0}',
    Volleyball: '\u{1F3D0}', Yoga: '\u{1F9D8}', Tennis: '\u{1F3BE}', Hiking: '\u{1F97E}',
    Dance: '\u{1F483}', Padel: '\u{1F3BE}', Skateboarding: '\u{1F6F9}', BMX: '\u{1F6B2}',
    Surfing: '\u{1F3C4}', 'Rock Climbing': '\u{1F9D7}', Golf: '\u26F3', Rugby: '\u{1F3C9}',
    Calisthenics: '\u{1F4AA}', 'Martial Arts': '\u{1F94B}',
  };
  return map[sport] || '\u{1F4AA}';
}

interface StoriesRowProps {
  userId: string | null;
  userAvatar?: string | null;
}

export default function StoriesRow({ userId, userAvatar }: StoriesRowProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const [groups, setGroups] = useState<SessionStoryGroup[]>([]);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Session picker + upload states
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

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
  }, [userId]);

  async function loadActiveSessions() {
    if (!userId) return;

    // Get all active sessions user created
    const { data: created } = await supabase
      .from('sessions')
      .select('id, sport, date, start_time, location')
      .eq('creator_id', userId)
      .eq('status', 'active')
      .order('date', { ascending: false });

    // Get all active sessions user joined
    const { data: joined } = await supabase
      .from('session_participants')
      .select('session_id, sessions!inner(id, sport, date, start_time, location, status)')
      .eq('user_id', userId)
      .eq('sessions.status', 'active');

    const sessionsMap = new Map<string, any>();

    // Add created sessions
    if (created) {
      for (const s of created) {
        sessionsMap.set(s.id, s);
      }
    }

    // Add joined sessions (deduplicate)
    if (joined) {
      for (const row of joined) {
        const s = (row as any).sessions;
        if (s && !sessionsMap.has(s.id)) {
          sessionsMap.set(s.id, s);
        }
      }
    }

    // Sort by date descending
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

  function handleYourStoryClick() {
    if (!userId) return;
    if (activeSessions.length === 0) {
      showInfo(language === 'es'
        ? 'Únete o crea una sesión primero para publicar una historia'
        : 'Join or create a session first to post a story');
    } else if (activeSessions.length === 1) {
      setSelectedSessionId(activeSessions[0].id);
      setShowUpload(true);
    } else {
      setShowSessionPicker(true);
    }
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
              onClick={handleYourStoryClick}
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
          currentUserId={userId}
          onClose={() => setViewerOpen(false)}
          onStorySeen={handleStoryViewed}
          onStoryDeleted={() => { sessionStorage.removeItem(CACHE_KEY); loadStories(); }}
        />
      )}

      {/* Session Picker bottom sheet */}
      {showSessionPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={() => setShowSessionPicker(false)}>
          <div
            className="bg-white dark:bg-[#2C3137] w-full sm:max-w-md sm:rounded-xl rounded-t-2xl max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-theme-primary">
                {language === 'es' ? 'Elegir Sesión' : 'Choose Session'}
              </h3>
              <button onClick={() => setShowSessionPicker(false)} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-full transition">
                <X className="w-5 h-5 text-theme-primary" />
              </button>
            </div>
            <div className="p-2">
              {activeSessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSessionId(s.id);
                    setShowSessionPicker(false);
                    setShowUpload(true);
                  }}
                  className="w-full flex items-center gap-3 p-3 hover:bg-stone-100 dark:hover:bg-[#3D4349] rounded-xl transition"
                >
                  <div className="w-10 h-10 bg-stone-100 dark:bg-[#3D4349] rounded-full flex items-center justify-center text-lg">
                    {getSportEmoji(s.sport)}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-semibold text-theme-primary text-sm">
                      {language === 'es' ? (sportTranslations[s.sport]?.es || s.sport) : s.sport}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-theme-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(s.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      {s.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{s.location}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Story Upload modal */}
      {showUpload && selectedSessionId && userId && (
        <StoryUpload
          sessionId={selectedSessionId}
          userId={userId}
          onClose={() => { setShowUpload(false); setSelectedSessionId(null); }}
          onUploaded={() => { sessionStorage.removeItem(CACHE_KEY); loadStories(); }}
        />
      )}
    </>
  );
}
