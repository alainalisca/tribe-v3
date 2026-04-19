'use client';

import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

export interface AvatarStackParticipant {
  user_id: string;
  name: string;
  avatar_url: string | null;
}

interface AvatarStackProps {
  participants: AvatarStackParticipant[];
  max?: number;
  size?: 'sm' | 'md';
  linkToProfile?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
} as const;

export default function AvatarStack({ participants, max = 4, size = 'md', linkToProfile = false }: AvatarStackProps) {
  const visible = participants.slice(0, max);
  const overflow = participants.length - max;
  const avatarSize = sizeClasses[size];

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {visible.map((p, idx) => {
          const avatar = (
            <Avatar
              key={p.user_id}
              className={`${avatarSize} border-2 border-white dark:border-tribe-card hover:z-10 transition-transform hover:scale-110`}
              style={{ zIndex: visible.length - idx }}
              title={p.name}
            >
              <AvatarImage loading="lazy" src={p.avatar_url || undefined} alt={p.name} />
              <AvatarFallback className="bg-tribe-green text-slate-900 font-bold">
                {p.name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          );

          if (linkToProfile) {
            return (
              <Link key={p.user_id} href={`/profile/${p.user_id}`}>
                {avatar}
              </Link>
            );
          }

          return avatar;
        })}
      </div>

      {overflow > 0 && <span className="text-xs text-stone-600 dark:text-tribe-gray-60">+{overflow}</span>}
    </div>
  );
}
