'use client';

import { ArrowLeft, Camera } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/LanguageContext';

interface SessionHeaderProps {
  language: 'en' | 'es';
  isCreator: boolean;
  hasJoined: boolean;
  user: { id: string } | null;
  sessionStories: { id: string }[];
  onAddStory: () => void;
}

export default function SessionHeader({
  language,
  isCreator,
  hasJoined,
  user,
  sessionStories,
  onAddStory,
}: SessionHeaderProps) {
  const { t } = useLanguage();
  return (
    <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-[#272D34] border-b border-stone-300 dark:border-black">
      <div className="max-w-2xl mx-auto h-14 flex items-center gap-4 px-4">
        <Link href="/">
          <Button variant="ghost" size="icon" className="rounded-lg hover:bg-stone-300 dark:hover:bg-[#52575D]">
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </Button>
        </Link>
        <h1 className="flex-1 text-xl font-bold text-stone-900 dark:text-white">{t('sessionDetails')}</h1>
        {user && (hasJoined || isCreator) && (
          <button
            onClick={onAddStory}
            className="relative p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition"
            title={language === 'es' ? 'Agregar Historia' : 'Add Story'}
          >
            <Camera className="w-6 h-6 text-tribe-green" />
            {sessionStories.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-tribe-green text-slate-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {sessionStories.length}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
