'use client';

import { downloadICS } from '@/lib/calendar';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';

interface CalendarButtonProps {
  session: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    duration?: number;
    location: string;
    description?: string;
    creator?: { name?: string };
  };
}

export default function CalendarButton({ session }: CalendarButtonProps) {
  const { t } = useLanguage();
  const handleAddToCalendar = () => {
    downloadICS({
      sport: session.sport,
      date: session.date,
      start_time: session.start_time,
      duration: session.duration,
      location: session.location,
      description: session.description,
      creatorName: session.creator?.name,
      sessionId: session.id,
    });
  };

  return (
    <Button
      onClick={handleAddToCalendar}
      variant="outline"
      className="flex items-center gap-2 px-4 py-2 border-stone-300 dark:border-stone-600 hover:bg-stone-50 dark:hover:bg-stone-800"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="text-sm font-medium">{t('addToCalendar')}</span>
    </Button>
  );
}
