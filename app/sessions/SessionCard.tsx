'use client';

import Link from 'next/link';
import { Calendar, MapPin, Users, ChevronRight } from 'lucide-react';
import { formatTime12Hour } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionsTranslations } from './translations';
import type { Currency } from '@/lib/payments/config';
import { formatSessionLocation } from '@/lib/sessionLocation';
import { useUserCurrency } from '@/lib/useUserCurrency';
import { formatPriceForUser } from '@/lib/userCurrency';
import { isSportOnlyTitle, publicSessionTitle } from '@/lib/share/sessionPublic';

interface SessionCardProps {
  session: {
    id: string;
    title?: string | null;
    status?: string | null;
    creator_id?: string | null;
    creator?: { name: string | null } | null;
    sport: string;
    date: string;
    start_time: string;
    location: string;
    current_participants: number | null;
    max_participants: number;
    is_paid?: boolean | null;
    price_cents?: number | null;
    currency?: string | null;
  };
  getSportName: (sport: string) => string;
  txt: SessionsTranslations;
  language: 'en' | 'es';
  /** The viewer. Their own sessions read "Organizaste", the rest "Te uniste". */
  userId: string | null;
  /** The viewer's name, for the "<Deporte> con <Nombre>" title of their own sessions. */
  ownName?: string | null;
  isPast?: boolean;
}

export default function SessionCard({
  session,
  getSportName,
  txt,
  language,
  userId,
  ownName = null,
  isPast = false,
}: SessionCardProps) {
  const { currency: userCurrency } = useUserCurrency();
  const isMine = !!userId && session.creator_id === userId;
  const isCancelled = session.status === 'cancelled';
  // Every card names its session: the title, or "<Deporte> con <host>" when
  // there is none or it only repeats the sport (the chip already says it).
  const title = publicSessionTitle(
    {
      title: isSportOnlyTitle(session.title, session.sport) ? null : session.title,
      sport: session.sport,
      creatorName: isMine ? ownName : (session.creator?.name ?? null),
    },
    language
  );
  return (
    <Link href={`/session/${session.id}`}>
      <Card
        className={`dark:bg-tribe-card border-stone-200 dark:border-tribe-mid hover:shadow-md transition cursor-pointer shadow-none ${isPast ? 'opacity-75' : ''}`}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isPast
                      ? 'bg-stone-200 dark:bg-tribe-mid text-stone-600 dark:text-gray-400'
                      : 'bg-tribe-green text-slate-900'
                  }`}
                >
                  {getSportName(session.sport)}
                </span>
                {session.is_paid && session.price_cents && (
                  <Badge className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full border-transparent font-bold">
                    {formatPriceForUser(session.price_cents, (session.currency || 'COP') as Currency, userCurrency)}
                  </Badge>
                )}
                {/* Past tense, so Historial only: in Próximas the section header
                    (ORGANIZANDO / ME UNÍ) already says it. */}
                {isPast && isMine && (
                  <Badge className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full border-transparent">
                    {txt.youHosted}
                  </Badge>
                )}
                {isPast && !isMine && (
                  <Badge className="px-2 py-1 bg-stone-100 dark:bg-tribe-mid text-stone-700 dark:text-gray-300 rounded-full border-transparent">
                    {txt.youJoined}
                  </Badge>
                )}
                {isCancelled ? (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">{txt.cancelled}</span>
                ) : (
                  isPast && <span className="text-xs text-stone-500 dark:text-gray-400">{txt.ended}</span>
                )}
              </div>

              <h3 className="font-semibold text-stone-900 dark:text-white leading-snug mb-1">{title}</h3>

              <div className="space-y-1">
                <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-stone-400" />
                  {new Date(session.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  • {formatTime12Hour(session.start_time)}
                </div>
                <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                  <MapPin className="w-4 h-4 mr-2 text-stone-400" />
                  <span className="truncate">{formatSessionLocation(session.location, null, null, language)}</span>
                </div>
                {!isPast && (
                  <div className="flex items-center text-stone-700 dark:text-gray-300 text-sm">
                    <Users className="w-4 h-4 mr-2 text-stone-400" />
                    {session.current_participants ?? 0}/{session.max_participants} {txt.spots}
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
