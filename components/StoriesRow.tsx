'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import Image from 'next/image';
import { Plus } from 'lucide-react';
import { showInfo } from '@/lib/toast';
import StoryViewer from './StoryViewer';
import StoryUpload from './StoryUpload';
import SessionPickerSheet from './stories/SessionPickerSheet';
import { useStoriesData } from './stories/useStoriesData';
import { truncate } from './stories/storiesRowHelpers';
import type { StoryGroup } from './stories/storyTypes';

// Re-export for external consumers
export { markStoriesSeen } from './stories/storiesRowHelpers';

interface StoriesRowProps {
  userId: string | null;
  userAvatar?: string | null;
  liveUserIds?: Set<string>;
}

export default function StoriesRow({ userId, userAvatar, liveUserIds }: StoriesRowProps) {
  const { t, language } = useLanguage();
  const { groups, seenIds, activeSessions, loaded, refreshStories, handleStoryViewed } = useStoriesData({ userId });

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  function openViewer(groupIndex: number) {
    setViewerStartIndex(groupIndex);
    setViewerOpen(true);
  }

  function handleYourStoryClick() {
    if (!userId) return;
    if (activeSessions.length === 0) {
      showInfo(t('joinOrCreateFirst'));
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

  const hasUnseen = (group: StoryGroup) => group.stories.some((s) => !seenIds.has(s.id));

  return (
    <>
      <div className="mb-4 -mx-4 px-4">
        <div
          className="flex gap-3 overflow-x-auto pb-2"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>

          {/* Current user's "+" circle */}
          {userId && (
            <button onClick={handleYourStoryClick} aria-label="Add your story" className="flex-shrink-0 flex flex-col items-center gap-1 w-[68px]">
              <div className="relative">
                <div className="w-14 h-14 rounded-full border-2 border-stone-300 dark:border-gray-500 overflow-hidden bg-stone-200 dark:bg-tribe-surface flex items-center justify-center">
                  {userAvatar ? (
                    <Image src={userAvatar} alt="Your profile photo" className="w-full h-full object-cover" width={40} height={40} unoptimized />
                  ) : (
                    <span className="text-xl font-bold text-stone-500">?</span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-tribe-green rounded-full flex items-center justify-center border-2 border-white dark:border-tribe-mid">
                  <Plus className="w-3 h-3 text-slate-900" strokeWidth={3} />
                </div>
              </div>
              <span className="text-[10px] text-theme-secondary text-center leading-tight truncate w-full">
                {t('yourStory')}
              </span>
            </button>
          )}

          {/* Session story circles */}
          {groups.map((group, i) => {
            const firstStory = group.stories[0];
            const unseen = hasUnseen(group);
            const hasLiveAuthor = liveUserIds ? group.stories.some((s) => liveUserIds.has(s.user_id)) : false;
            return (
              <button
                key={group.sessionId}
                onClick={() => openViewer(i)}
                aria-label={`View ${firstStory.user_name || 'user'}'s story`}
                className="flex-shrink-0 flex flex-col items-center gap-1 w-[68px]"
              >
                <div
                  className={`w-14 h-14 rounded-full p-[2.5px] ${
                    hasLiveAuthor
                      ? 'bg-gradient-to-br from-red-500 to-red-400 animate-pulse'
                      : unseen
                        ? 'bg-gradient-to-br from-tribe-green to-lime-400'
                        : 'bg-stone-300 dark:bg-gray-500'
                  }`}
                >
                  <div className="w-full h-full rounded-full overflow-hidden bg-white dark:bg-tribe-surface flex items-center justify-center">
                    {firstStory.user_avatar ? (
                      <img
                        src={firstStory.user_avatar}
                        alt={`${firstStory.user_name}'s avatar`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-lg font-bold text-stone-500">{firstStory.user_name[0]?.toUpperCase()}</span>
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
          onStoryDeleted={refreshStories}
        />
      )}

      {/* Session Picker bottom sheet */}
      {showSessionPicker && (
        <SessionPickerSheet
          language={language}
          activeSessions={activeSessions}
          onSelectSession={(sessionId) => {
            setSelectedSessionId(sessionId);
            setShowSessionPicker(false);
            setShowUpload(true);
          }}
          onClose={() => setShowSessionPicker(false)}
        />
      )}

      {/* Story Upload modal */}
      {showUpload && selectedSessionId && userId && (
        <StoryUpload
          sessionId={selectedSessionId}
          userId={userId}
          onClose={() => {
            setShowUpload(false);
            setSelectedSessionId(null);
          }}
          onUploaded={refreshStories}
        />
      )}
    </>
  );
}
