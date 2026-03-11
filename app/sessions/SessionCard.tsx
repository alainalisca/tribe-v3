'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import { formatTime12Hour } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionsTranslations } from './translations';

interface SessionCardProps {
  session: {
    id: string;
    sport: string;
    date: string;
    start_time: string;
    location: string;
    current_participants: number | null;
    max_participants: number;
  };
  getSportName: (sport: string) => string;
  txt: SessionsTranslations;
  language: 'en' | 'es';
  isHost?: boolean;
  isPast?: boolean;
}

export default function SessionCard({
  session,
  getSportName,
  txt,
  language,
  isHost = false,
  isPast = false,
}: SessionCardProps) {
  return (
    <Link href={`/session/${session.id}`}>
      <Card
        className={`dark:bg-[#6B7178] border-stone-200 dark:border-[#52575D] hover:shadow-md transition cursor-pointer shadow-none ${isPast ? 'opacity-75' : ''}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isPast
                      ? 'bg-stone-200 dark:bg-[#52575D] text-stone-600 dark:text-gray-400'
                      : 'bg-tribe-green text-slate-900'
                  }`}
                >
                  {getSportName(session.sport)}
                </span>
                {isHost && (
                  <Badge className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full border-transparent">
                    {txt.hosting}
                  </Badge>
                )}
                {isPast && <span className="text-xs text-stone-500 dark:text-gray-400">{txt.ended}</span>}
              </div>

              <div className="space-y-1">
                <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-stone-400" />
                  {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  • {formatTime12Hour(session.start_time)}
                </div>
                <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                  <MapPin className="w-4 h-4 mr-2 text-stone-400" />
                  <span className="truncate">{session.location}</span>
                </div>
                {!isPast && (
                  <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                    <Users className="w-4 h-4 mr-2 text-stone-400" />
                    {session.current_participants || 1}/{session.max_participants} {txt.spots}
                  </div>
                )}
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-stone-400 flex-shrink-0 ml-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
