'use client';

import { Calendar, MapPin, Users, Clock, Share2 } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import { calculateDistance, formatDistance } from '@/lib/distance';

interface SessionCardProps {
  currentUserId?: string;
  session: any;
  onJoin?: (sessionId: string) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onEdit?: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}

export default function SessionCard({ session, onJoin, userLocation, currentUserId, onEdit, onDelete }: SessionCardProps) {
  const { t, language } = useLanguage();
  
  const sportColors: Record<string, string> = {
    Running: 'bg-[#C0E863] text-[#272D34]',
    CrossFit: 'bg-[#C0E863] text-[#272D34]',
    Basketball: 'bg-orange-500 text-white',
    Soccer: 'bg-green-600 text-white',
    Tennis: 'bg-yellow-500 text-[#272D34]',
    Swimming: 'bg-blue-500 text-white',
    BJJ: 'bg-purple-600 text-white',
    Volleyball: 'bg-pink-500 text-white',
    Football: 'bg-red-600 text-white',
    Cycling: 'bg-indigo-500 text-white',
    Yoga: 'bg-teal-500 text-white',
    Climbing: 'bg-amber-600 text-white',
    Boxing: 'bg-red-700 text-white',
    Dance: 'bg-fuchsia-500 text-white',
  };

  const sportColor = sportColors[session.sport] || 'bg-[#C0E863] text-[#272D34]';

  async function handleShare() {
    const url = `${window.location.origin}/session/${session.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${session.sport} - ${session.location}`,
          text: `Join my ${session.sport} session on ${new Date(session.date).toLocaleDateString()}`,
          url: url
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      navigator.clipboard.writeText(url);
      alert('Link copied to clipboard!');
    }
  }

  const isFull = session.current_participants >= session.max_participants;
  const isPast = new Date(session.date) < new Date();
  
  const confirmedParticipants = session.participants?.filter((p: any) => p.status === 'confirmed') || [];
  const userHasJoined = currentUserId && confirmedParticipants.some((p: any) => p.user_id === currentUserId);
  const isCreator = session.creator_id === currentUserId;

  let distance: string | null = null;
  if (userLocation && session.latitude && session.longitude) {
    const km = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      session.latitude,
      session.longitude
    );
    distance = formatDistance(km, language);
  }

  return (
    <div className="bg-white dark:bg-[#6B7178] border border-stone-300 dark:border-[#52575D] rounded-xl p-4 shadow-sm hover:shadow-md hover:border-[#C0E863] transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${sportColor}`}>
            {language === "es" ? (sportTranslations[session.sport]?.es || session.sport) : session.sport}
          </span>
          {isCreator && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              👤 {language === 'es' ? 'Anfitrión' : 'Host'}
            </span>
          )}
          {isPast && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 dark:bg-[#E33629]/20 text-[#E33629] dark:text-red-300">
              {t('past')}
            </span>
          )}
          {userHasJoined && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              ✓ {t('joined') || 'Joined'}
            </span>
          )}
          {session.join_policy === 'curated' && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300">
              👥 Curated
            </span>
          )}
          {session.join_policy === 'invite_only' && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
              🔒 Private
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end text-stone-600 dark:text-[#B1B3B6] text-sm mb-1">
            <Users className="w-4 h-4 mr-1" />
            {session.current_participants}/{session.max_participants}
          </div>
          <div className="w-20 h-1.5 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${isFull ? 'bg-red-500' : 'bg-tribe-green'}`}
              style={{ width: `${(session.current_participants / session.max_participants) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center text-[#272D34] dark:text-white">
          <Calendar className="w-4 h-4 mr-2 text-stone-500 dark:text-[#B1B3B6]" />
          <span className="font-medium">
            {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </span>
          <Clock className="w-4 h-4 ml-4 mr-2 text-stone-500 dark:text-[#B1B3B6]" />
          <span className="font-medium">{session.start_time}</span>
        </div>

        <div className="flex gap-2 mt-2">
          <button onClick={handleShare} className="flex-1 px-3 py-1.5 border border-tribe-green text-tribe-green hover:bg-tribe-green/10 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition">
            <Share2 className="w-3 h-3" /> {t('share')}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              window.location.href = `/session/${session.id}/chat`;
            }}
            className="flex-1 px-3 py-1.5 bg-blue-500 text-white hover:bg-blue-600 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition"
          >
            💬 Chat
          </button>
        </div>

        <div className="flex items-center text-stone-600 dark:text-[#E0E0E0]">
          <MapPin className="w-4 h-4 mr-2" />
          <span className="text-sm">{session.location}</span>
          {distance && (
            <span className="ml-2 px-2 py-0.5 bg-tribe-green text-slate-900 rounded-full text-xs font-semibold">
              {distance} {language === 'es' ? 'de distancia' : 'away'}
            </span>
          )}
        </div>

        {session.description && (
          <p className="text-sm text-stone-700 dark:text-[#E0E0E0] mt-2 line-clamp-2">
            {session.description}
          </p>
        )}

        {session.creator && (
          <p className="text-xs text-stone-500 dark:text-[#B1B3B6]">
            {t('hostedBy')} {session.creator.name}
          </p>
        )}

        {confirmedParticipants.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex -space-x-2">
              {confirmedParticipants.slice(0, 5).map((p: any, idx: number) => (
                <Link key={idx} href={`/profile/${p.user_id}`}>
                  {p.user?.avatar_url ? (
                    <img
                      src={p.user.avatar_url}
                      alt={p.user.name}
                      className="w-8 h-8 rounded-full border-2 border-white object-cover cursor-pointer hover:scale-110 transition"
                      title={p.user.name}
                    />
                  ) : (
                    <div 
                      className="w-8 h-8 rounded-full border-2 border-white bg-tribe-green flex items-center justify-center text-xs font-bold cursor-pointer hover:scale-110 transition"
                      title={p.user?.name || 'User'}
                    >
                      {p.user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                  )}
                </Link>
              ))}
              {confirmedParticipants.length > 5 && (
                <div className="w-8 h-8 rounded-full border-2 border-white bg-stone-300 flex items-center justify-center text-xs font-bold">
                  +{confirmedParticipants.length - 5}
                </div>
              )}
            </div>
            <span className="text-xs text-stone-500">
              {confirmedParticipants.length} {confirmedParticipants.length === 1 ? 'participant' : 'participants'}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Link href={`/session/${session.id}`} className="flex-1">
          <button className="w-full py-2 px-4 border border-stone-300 dark:border-[#52575D] text-[#272D34] dark:text-white rounded-lg hover:bg-stone-50 dark:hover:bg-[#52575D] transition font-medium">
            {t('viewDetails')}
          </button>
        </Link>
        
        {onJoin && !isPast && !userHasJoined && session.creator_id !== currentUserId && (
          <button
            onClick={() => onJoin(session.id)}
            disabled={isFull}
            className={`flex-1 py-2 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              isFull
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-[#C0E863] text-[#272D34] hover:bg-[#b0d853]'
            }`}
          >
            <Users className="w-4 h-4" />
            {isFull ? t('full') : t('join')}
          </button>
        )}
      </div>
    </div>
  );
}
