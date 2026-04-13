'use client';

import Image from 'next/image';
import type { SessionStoryJoined } from './types';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';

interface SessionStoriesProps {
  stories: SessionStoryJoined[];
  language: 'en' | 'es';
  onViewStories: () => void;
}

export default function SessionStories({ stories, language: _language, onViewStories }: SessionStoriesProps) {
  const { t } = useLanguage();
  if (stories.length === 0) return null;

  return (
    <Card className="dark:bg-tribe-card shadow-lg">
      <CardContent className="p-4">
        <h2 className="text-sm font-bold text-stone-900 dark:text-white mb-3">
          {t('stories')} ({stories.length})
        </h2>
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {stories.map((story) => (
            <button
              key={story.id}
              onClick={onViewStories}
              className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 border-stone-200 dark:border-gray-600 hover:border-tribe-green transition active:scale-95 relative"
            >
              {story.media_type === 'video' && story.thumbnail_url ? (
                <Image src={story.thumbnail_url} alt={`Video thumbnail by ${story.user?.name || 'participant'}`} className="w-full h-full object-cover" fill unoptimized />
              ) : story.media_type === 'video' ? (
                <div className="w-full h-full bg-stone-800 flex items-center justify-center">
                  <span className="text-white text-xl">▶</span>
                </div>
              ) : (
                <Image src={story.media_url} alt={`Story by ${story.user?.name || 'participant'}`} className="w-full h-full object-cover" fill unoptimized />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                <span className="text-white text-[9px] truncate block">{story.user?.name}</span>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
