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

  // Gradient fallback if no cover image
  const coverStyle = community.cover_image_url
    ? { backgroundImage: `url(${community.cover_image_url})` }
    : { background: 'linear-gradient(135deg, #A3E635, #9EE551)' };

  return (
    <Link
      href={`/communities/${community.id}`}
      onClick={onClick}
      className="block"
    >
      <div className="bg-white dark:bg-[#52575D] rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow">
        {/* Cover image */}
        <div
          className="w-full h-40 bg-cover bg-center"
          style={coverStyle}
        />

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Name and sport */}
          <div>
            <h3 className="font-semibold text-theme-primary line-clamp-2">{community.name}</h3>
            {sportName && (
              <p className="text-xs text-stone-500 dark:text-gray-400 mt-1">{sportName}</p>
            )}
          </div>

          {/* Description */}
          {community.description && (
            <p className="text-sm text-stone-600 dark:text-gray-300 line-clamp-2">
              {community.description}
            </p>
          )}

          {/* Member count */}
          <div className="flex items-center gap-1 text-xs text-stone-500 dark:text-gray-400">
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
