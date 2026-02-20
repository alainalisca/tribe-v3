'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import StoryViewer from '@/components/StoryViewer';
import { markStoriesSeen } from '@/components/StoriesRow';

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

export default function StoriesPage() {
  const supabase = createClient();
  const router = useRouter();
  const { language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [allStories, setAllStories] = useState<(Story & { sessionId: string; sport: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);

  const t = language === 'es' ? {
    stories: 'Historias',
    noStories: 'No hay historias aún',
    noStoriesDesc: 'Las historias de sesiones aparecerán aquí. ¡Sé el primero en compartir tu entrenamiento!',
    storiesCount: 'historias',
  } : {
    stories: 'Stories',
    noStories: 'No stories yet',
    noStoriesDesc: 'Session stories will appear here. Be the first to share your training!',
    storiesCount: 'stories',
  };

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user) loadStories();
  }, [user]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
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
        setAllStories([]);
        return;
      }

      // Build flat list for the grid (most recent first)
      const flat: (Story & { sessionId: string; sport: string })[] = data.map((row) => {
        const u = row.user as any;
        const s = row.session as any;
        return {
          id: row.id,
          media_url: row.media_url,
          media_type: row.media_type as 'image' | 'video',
          thumbnail_url: row.thumbnail_url,
          caption: row.caption,
          created_at: row.created_at,
          user_id: row.user_id,
          user_name: u?.name || '?',
          user_avatar: u?.avatar_url || null,
          sessionId: row.session_id,
          sport: s?.sport || '?',
        };
      });
      setAllStories(flat);

      // Group by session_id for the StoryViewer
      const map = new Map<string, StoryGroup>();
      for (const story of flat) {
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
        g.stories.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      setGroups(grouped);
    } catch (err) {
      console.error('Error loading stories:', err);
    } finally {
      setLoading(false);
    }
  }

  function openStoryViewer(story: Story & { sessionId: string }) {
    // Find the group index that contains this story
    const groupIdx = groups.findIndex(g => g.sessionId === story.sessionId);
    if (groupIdx >= 0) {
      setViewerStartIndex(groupIdx);
      setViewerOpen(true);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-[#52575D]">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-4 px-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="flex-1 text-xl font-bold text-stone-900 dark:text-white">
            {t.stories}
          </h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div>
          </div>
        ) : allStories.length === 0 ? (
          <div className="bg-white dark:bg-[#6B7178] rounded-xl p-8 text-center border border-stone-200 dark:border-[#52575D] mt-4">
            <div className="text-4xl mb-4">📸</div>
            <p className="text-lg font-semibold text-theme-primary mb-2">
              {t.noStories}
            </p>
            <p className="text-sm text-theme-secondary">
              {t.noStoriesDesc}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {allStories.map((story) => {
              const thumbnail = story.media_type === 'video' && story.thumbnail_url
                ? story.thumbnail_url
                : story.media_url;
              const sportName = language === 'es'
                ? (sportTranslations[story.sport]?.es || story.sport)
                : story.sport;

              return (
                <button
                  key={story.id}
                  onClick={() => openStoryViewer(story)}
                  className="relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-200 dark:bg-[#3D4349]"
                >
                  {story.media_type === 'image' ? (
                    <img
                      src={thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <img
                      src={story.thumbnail_url || ''}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}

                  {/* Play icon for videos */}
                  {story.media_type === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center">
                        <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-white ml-1" />
                      </div>
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Info overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-stone-600 flex-shrink-0 flex items-center justify-center">
                        {story.user_avatar ? (
                          <img src={story.user_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-white font-bold">
                            {story.user_name[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-white text-xs font-semibold truncate">{story.user_name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-white/80 text-xs">{sportName}</span>
                      <span className="text-white/60 text-[10px]">{timeAgo(story.created_at, language)}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {viewerOpen && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerStartIndex}
          currentUserId={user?.id}
          onClose={() => setViewerOpen(false)}
          onStorySeen={(ids) => markStoriesSeen(ids)}
          onStoryDeleted={() => loadStories()}
        />
      )}

      <BottomNav />
    </div>
  );
}
