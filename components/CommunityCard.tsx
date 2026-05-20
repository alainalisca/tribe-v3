'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';
import type { CommunityWithCreator } from '@/lib/dal/communities';

interface CommunityCardProps {
  community: CommunityWithCreator;
  onClick?: () => void;
}

export default function CommunityCard({ community, onClick }: CommunityCardProps) {
  const { language } = useLanguage();

  const sportName = community.sport ? sportTranslations[community.sport]?.[language] || community.sport : null;

  return (
    <Link href={`/communities/${community.id}`} onClick={onClick} className="block h-full">
      <div className="h-full bg-white dark:bg-tribe-mid rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow flex flex-col">
        {/* Cover image — name-centered fallback when no cover_image_url */}
        {community.cover_image_url ? (
          <div
            className="w-full h-40 flex-shrink-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${community.cover_image_url})` }}
          />
        ) : (
          <div className="h-40 w-full flex-shrink-0 bg-gradient-to-br from-tribe-green via-lime-500 to-emerald-600 relative overflow-hidden flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/20 to-transparent" />
            <div className="relative z-10 text-center">
              <p className="text-2xl font-extrabold text-white tracking-tight leading-tight line-clamp-2">
                {community.name}
              </p>
              {sportName && (
                <p className="text-xs font-semibold text-white/80 uppercase tracking-wider mt-1">{sportName}</p>
              )}
            </div>
          </div>
        )}

        {/* Content. flex-1 + mt-auto on the footer keeps every card the same
            height even when description is missing (was uneven before). */}
        <div className="p-4 flex flex-col flex-1">
          <div>
            <h3 className="font-semibold text-theme-primary line-clamp-2">{community.name}</h3>
            {sportName && <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">{sportName}</p>}
          </div>

          {/* Description — always rendered with a fixed line clamp so missing
              descriptions don't shrink the card. */}
          <p className="text-sm text-stone-600 dark:text-gray-300 line-clamp-2 mt-3 min-h-[2.5rem]">
            {community.description || ''}
          </p>

          {/* Member count pinned to bottom of card */}
          <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-gray-400 mt-auto pt-3">
            <Users className="w-4 h-4" />
            <span>
              {community.member_count} {language === 'es' ? 'miembros' : 'members'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
