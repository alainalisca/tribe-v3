'use client';

import Link from 'next/link';
import Image from 'next/image';
import { sportTranslations } from '@/lib/translations';
import type { TrainingPartner } from '@/lib/dal/connections';

interface TrainingPartnerCardProps {
  partner: TrainingPartner;
  language: string;
}

export default function TrainingPartnerCard({ partner, language }: TrainingPartnerCardProps) {
  const sportName = sportTranslations[partner.primary_sport]?.[language as 'en' | 'es'] || partner.primary_sport;

  return (
    <Link href={`/profile/${partner.id}`}>
      <div className="flex-shrink-0 w-40 bg-white dark:bg-[#52575D] rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
        {/* Avatar section */}
        <div className="relative h-32 bg-gradient-to-br from-[#A3E635] to-[#8fd61d]">
          {partner.avatar_url ? (
            <Image src={partner.avatar_url} alt={partner.name} fill className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-stone-700">
              {partner.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-3 space-y-2">
          {/* Name */}
          <h3 className="font-semibold text-stone-900 dark:text-white line-clamp-2 text-sm">{partner.name}</h3>

          {/* Sport tag */}
          <div className="flex flex-wrap gap-1">
            <span className="inline-block bg-[#A3E635] text-stone-900 text-xs font-semibold px-2 py-1 rounded-full">
              {sportName}
            </span>
          </div>

          {/* Distance */}
          <p className="text-xs text-stone-600 dark:text-gray-400">{partner.distance_km} km away</p>

          {/* Shared sports count */}
          {partner.shared_sport_count > 0 && (
            <p className="text-xs text-stone-600 dark:text-gray-400">
              <span className="text-[#A3E635]">✓</span> {partner.shared_sport_count}{' '}
              {partner.shared_sport_count === 1 ? 'sport' : 'sports'} in common
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
