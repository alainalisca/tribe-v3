'use client';

import Link from 'next/link';
import Image from 'next/image';
import { UserPlus } from 'lucide-react';
import { sportTranslations } from '@/lib/translations';
import type { TrainingPartner } from '@/lib/dal/connections';

interface TrainingPartnerCardProps {
  partner: TrainingPartner;
  language: string;
  onInvite?: () => void;
}

export default function TrainingPartnerCard({ partner, language, onInvite }: TrainingPartnerCardProps) {
  const sportName = sportTranslations[partner.primary_sport]?.[language as 'en' | 'es'] || partner.primary_sport;
  const isEs = language === 'es';

  const initials = partner.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex-shrink-0 w-40 bg-white dark:bg-[#52575D] rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <Link href={`/profile/${partner.id}`}>
        {/* Avatar section */}
        <div className="relative h-32 bg-gradient-to-br from-[#A3E635] to-[#8fd61d]">
          {partner.avatar_url ? (
            <Image src={partner.avatar_url} alt={partner.name} fill className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-stone-700">
              {initials}
            </div>
          )}
        </div>

        {/* Content section */}
        <div className="p-3 space-y-1.5">
          {/* Name */}
          <h3 className="font-semibold text-stone-900 dark:text-white line-clamp-1 text-sm">{partner.name}</h3>

          {/* Sport tag */}
          <div className="flex flex-wrap gap-1">
            <span className="inline-block bg-[#A3E635] text-stone-900 text-xs font-semibold px-2 py-0.5 rounded-full">
              {sportName}
            </span>
          </div>

          {/* Distance */}
          <p className="text-xs text-stone-600 dark:text-gray-400">
            {partner.distance_km < 0
              ? language === 'es'
                ? 'Ubicacion desconocida'
                : 'Location unknown'
              : `${partner.distance_km} km`}
          </p>
        </div>
      </Link>

      {/* Invite button — outside the Link to prevent navigation */}
      {onInvite && (
        <div className="px-3 pb-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInvite();
            }}
            className="w-full flex items-center justify-center gap-1 py-1.5 bg-[#A3E635] text-stone-900 text-xs font-semibold rounded-full hover:bg-[#8fd61d] transition"
          >
            <UserPlus className="w-3 h-3" />
            {isEs ? 'Invitar' : 'Invite'}
          </button>
        </div>
      )}
    </div>
  );
}
