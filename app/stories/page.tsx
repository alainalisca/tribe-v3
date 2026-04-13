/** Page: /stories — Upload and manage training story photos/videos */
'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getStoriesTranslations } from './translations';
import { useStoriesData } from './useStoriesData';
import { timeAgo } from './types';

export default function StoriesPage() {
  const { language } = useLanguage();
  const t = getStoriesTranslations(language);
  const {
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
  } = useStoriesData();

  if (!user) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }

  const StoryViewer = StoryViewerComp;

  return (
    <div className="min-h-screen pb-32 bg-stone-50 dark:bg-tribe-mid">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-4 px-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="flex-1 text-xl font-bold text-stone-900 dark:text-white">{t.stories}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {loading ? (
          <LoadingSpinner />
        ) : allStories.length === 0 ? (
          <Card className="dark:bg-tribe-card border-stone-200 dark:border-[#52575D] shadow-none mt-4">
            <CardContent className="p-8 text-center">
              <div className="text-4xl mb-4">📸</div>
              <p className="text-lg font-semibold text-theme-primary mb-2">{t.noStories}</p>
              <p className="text-sm text-theme-secondary">{t.noStoriesDesc}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {allStories.map((story) => {
              const thumbnail =
                story.media_type === 'video' && story.thumbnail_url ? story.thumbnail_url : story.media_url;
              const sportName = language === 'es' ? sportTranslations[story.sport]?.es || story.sport : story.sport;

              return (
                <button
                  key={story.id}
                  onClick={() => openStoryViewer(story)}
                  className="relative aspect-[3/4] rounded-xl overflow-hidden bg-stone-200 dark:bg-tribe-surface"
                >
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-3xl">📷</span>
                    </div>
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
                          <img loading="lazy" src={story.user_avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-white font-bold">
                            {(story.user_name || '?')[0]?.toUpperCase()}
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

      {viewerOpen && StoryViewer && groups.length > 0 && (
        <StoryViewer
          groups={groups}
          startGroupIndex={viewerStartIndex}
          currentUserId={user?.id}
          onClose={() => setViewerOpen(false)}
          onStorySeen={(ids: string[]) => markStoriesSeen(ids)}
          onStoryDeleted={() => loadStories()}
        />
      )}

      <BottomNav />
    </div>
  );
}
