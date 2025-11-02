'use client';

import { Calendar, MapPin, Users, Clock, UserPlus, CheckCircle } from 'lucide-react';
import { format, parseISO, isPast } from 'date-fns';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

interface SessionCardProps {
  session: any;
  onJoin?: () => void;
  currentUserId?: string;
  showJoinButton?: boolean;
}

export default function SessionCard({ session, onJoin, currentUserId, showJoinButton = true }: SessionCardProps) {
  const { t } = useLanguage();
  const sessionDate = parseISO(session.date);
  const sessionDateTime = parseISO(`${session.date}T${session.start_time}`);
  const dateLabel = format(sessionDate, 'EEE, MMM d');
  const timeLabel = format(parseISO(`2000-01-01T${session.start_time}`), 'h:mm a');
  
  const isCreator = currentUserId === session.creator_id;
  const hasJoined = session.participants?.some(
    (p: any) => p.user_id === currentUserId
  );
  const isFull = session.current_participants >= session.max_participants;
  const isPastSession = isPast(sessionDateTime);

  const sportColors: Record<string, string> = {
    football: 'bg-gray-700',
    basketball: 'bg-blue-500',
    crossfit: 'bg-orange-500',
    bjj: 'bg-purple-600',
    running: 'bg-green-500',
    swimming: 'bg-cyan-500',
    tennis: 'bg-yellow-500',
    volleyball: 'bg-pink-500',
    soccer: 'bg-green-600',
  };

  const sportColor = sportColors[session.sport?.toLowerCase()] || 'bg-gray-600';

  return (
    <div className="bg-tribe-dark rounded-xl overflow-hidden border border-slate-700 hover:border-slate-600 transition">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold text-white ${sportColor}`}>
                {session.sport}
              </span>
              {isPastSession && (
                <span className="text-xs text-red-400 font-medium">{t('past')}</span>
              )}
            </div>
            <div className="flex items-center text-gray-300">
              <Calendar className="w-4 h-4 mr-1" />
              <span className="font-medium text-sm">{dateLabel}</span>
              <Clock className="w-4 h-4 ml-3 mr-1" />
              <span className="font-medium text-sm">{timeLabel}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center text-gray-400">
              <Users className="w-4 h-4 mr-1" />
              <span className="text-sm">{session.current_participants}/{session.max_participants}</span>
            </div>
            {isFull && (
              <span className="text-xs text-red-400 mt-1 block">{t('full')}</span>
            )}
          </div>
        </div>

        <div className="flex items-start text-gray-400 mb-2">
          <MapPin className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{session.location}</span>
        </div>

        {session.description && (
          <p className="text-gray-300 text-sm mb-3 line-clamp-2">{session.description}</p>
        )}

        <div className="flex items-center text-sm text-gray-400 mb-3">
          <span>{t('hostedBy')} {session.creator?.name || 'Unknown'}</span>
        </div>

        <div className="flex gap-2">
          <Link href={`/session/${session.id}`} className="flex-1">
            <button className="w-full py-2 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition text-sm">
              {t('viewDetails')}
            </button>
          </Link>
          
          {showJoinButton && !isCreator && onJoin && (
            hasJoined ? (
              <button
                disabled
                className="flex-1 py-2 bg-tribe-green/20 text-tribe-green font-semibold rounded-lg flex items-center justify-center gap-2 text-sm"
              >
                <CheckCircle className="w-4 h-4" />
                {t('joined')}
              </button>
            ) : (
              <button
                onClick={onJoin}
                disabled={isFull || isPastSession}
                className={`flex-1 py-2 font-semibold rounded-lg flex items-center justify-center gap-2 transition text-sm ${
                  isFull || isPastSession
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-tribe-green text-slate-900 hover:bg-lime-500'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                {isFull ? t('full') : isPastSession ? t('past') : t('join')}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
