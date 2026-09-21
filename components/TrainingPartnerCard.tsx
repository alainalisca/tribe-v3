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
  const isEs = language === 'es';

  // SHOW SPORTS, RANK BY LOCATION. The card used to show one sport and a
  // distance; the distance is gone and the sports take its place.
  //
  // Two chips, because the card is 160px wide and a third wraps. The overflow
  // count is not decoration: without it a five-sport athlete would look
  // identical to a two-sport one, and sports are now the only thing
  // distinguishing cards beyond the name.
  const shown = partner.sports.slice(0, 2);
  const overflow = partner.sports.length - shown.length;

  const initials = partner.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex-shrink-0 w-40 bg-white dark:bg-tribe-mid rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <Link href={`/profile/${partner.id}`}>
        {/* Avatar section */}
        <div className="relative h-32 bg-gradient-to-br from-tribe-green-light to-tribe-green-hover">
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

          {/* Sports. NO DISTANCE: a distance on a stranger's card discloses
              roughly where they live, and T-ATH1 reserves that for people who
              have trained together. Ordering already carries proximity. */}
          <div className="flex flex-wrap gap-1">
            {shown.map((sport) => (
              <span
                key={sport}
                className="inline-block bg-tribe-green-light text-stone-900 text-xs font-semibold px-2 py-0.5 rounded-full"
              >
                {sportTranslations[sport]?.[language as 'en' | 'es'] || sport}
              </span>
            ))}
            {overflow > 0 && (
              <span className="inline-block text-xs font-medium text-stone-600 dark:text-gray-400 px-1 py-0.5">
                +{overflow}
              </span>
            )}
          </div>
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
            className="w-full flex items-center justify-center gap-1 py-1.5 bg-tribe-green-light text-stone-900 text-xs font-semibold rounded-full hover:bg-tribe-green-hover transition"
          >
            <UserPlus className="w-3 h-3" />
            {isEs ? 'Invitar' : 'Invite'}
          </button>
        </div>
      )}
    </div>
  );
}
