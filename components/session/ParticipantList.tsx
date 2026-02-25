'use client';

import { UserX } from 'lucide-react';
import Link from 'next/link';

interface CreatorInfo {
  id: string;
  name: string;
  avatar_url: string | null;
  average_rating: number | null;
  total_reviews: number | null;
}

interface ParticipantInfo {
  user_id: string | null;
  status: string | null;
  is_guest?: boolean | null;
  guest_name?: string | null;
  user?: { id: string; name: string; avatar_url: string | null } | null;
}

interface ParticipantListProps {
  creator: CreatorInfo | null;
  participants: ParticipantInfo[];
  canKick: boolean;
  language: 'en' | 'es';
  onKickUser: (userId: string, userName: string) => void;
}

export default function ParticipantList({
  creator,
  participants,
  canKick,
  language,
  onKickUser,
}: ParticipantListProps) {
  if (!creator && participants.length === 0) return null;

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
        {language === 'es' ? 'Participantes' : 'Participants'} ({participants.length + 1})
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {creator && (
          <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
            <Link href={`/profile/${creator.id}`} className="flex items-center gap-3 flex-1">
              {creator.avatar_url ? (
                <img loading="lazy"
                  src={creator.avatar_url}
                  alt={creator.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-lg">
                  {creator.name[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{creator.name}</p>
                <p className="text-xs text-tribe-green font-semibold">{language === 'es' ? 'Anfitrión' : 'Host'}</p>
              </div>
            </Link>
          </div>
        )}

        {participants.map((participant) => (
          <div key={participant.user_id} className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
            <Link href={`/profile/${participant.user_id}`} className="flex items-center gap-3 flex-1">
              {participant.user?.avatar_url ? (
                <img loading="lazy"
                  src={participant.user.avatar_url}
                  alt={participant.user.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center text-slate-900 font-bold text-lg">
                  {participant.is_guest ? participant.guest_name?.[0]?.toUpperCase() : participant.user?.name?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <p className="font-medium text-stone-900 dark:text-white">
                {participant.is_guest ? participant.guest_name : participant.user?.name || 'Unknown'}
              </p>
            </Link>

            {canKick && (
              <button
                onClick={() => participant.user_id && onKickUser(participant.user_id, participant.user?.name || 'Unknown')}
                className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                title="Remove from session"
              >
                <UserX className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
