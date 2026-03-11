'use client';

import { UserX } from 'lucide-react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLanguage } from '@/lib/LanguageContext';

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
  language: _language,
  onKickUser,
}: ParticipantListProps) {
  const { t } = useLanguage();
  if (!creator && participants.length === 0) return null;

  return (
    <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4">
        {t('participants')} ({participants.length + 1})
      </h2>
      <div className="grid grid-cols-1 gap-3">
        {creator && (
          <div className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg">
            <Link href={`/profile/${creator.id}`} className="flex items-center gap-3 flex-1">
              <Avatar className="w-12 h-12">
                <AvatarImage loading="lazy" src={creator.avatar_url || undefined} alt={creator.name || ''} />
                <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-lg">
                  {creator.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{creator.name}</p>
                <p className="text-sm text-muted-foreground">{t('host')}</p>
              </div>
            </Link>
          </div>
        )}

        {participants.map((participant, index) => {
          const isGuest = !participant.user_id;
          const displayName = participant.is_guest ? participant.guest_name : participant.user?.name || t('unknown');
          const avatarInitial = participant.is_guest
            ? participant.guest_name?.[0]?.toUpperCase()
            : participant.user?.name?.[0]?.toUpperCase() || 'U';

          const avatar = (
            <Avatar className="w-12 h-12">
              <AvatarImage loading="lazy" src={participant.user?.avatar_url || undefined} alt={displayName ?? ''} />
              <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-lg">
                {avatarInitial}
              </AvatarFallback>
            </Avatar>
          );

          return (
            <div
              key={participant.user_id ?? `guest-${index}`}
              className="flex items-center justify-between p-3 bg-stone-50 dark:bg-[#52575D] rounded-lg"
            >
              {isGuest ? (
                <div className="flex items-center gap-3 flex-1">
                  {avatar}
                  <div>
                    <p className="font-medium text-stone-900 dark:text-white">{displayName}</p>
                    <span className="text-sm text-muted-foreground">{t('guest')}</span>
                  </div>
                </div>
              ) : (
                <Link href={`/profile/${participant.user_id}`} className="flex items-center gap-3 flex-1">
                  {avatar}
                  <p className="font-medium text-stone-900 dark:text-white">{displayName}</p>
                </Link>
              )}

              {canKick && participant.user_id && (
                <button
                  onClick={() => onKickUser(participant.user_id!, participant.user?.name || t('unknown'))}
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                  title="Remove from session"
                >
                  <UserX className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
