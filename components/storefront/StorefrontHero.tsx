'use client';

import Image from 'next/image';
import { Check, MapPin } from 'lucide-react';
import type { Instructor } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontHeroProps {
  instructor: Instructor;
  language: 'en' | 'es';
}

/**
 * Full-width hero (spec 6A/6B): banner, instructor photo, sport tag,
 * verified badge, name + location. Decorative gradient fallback kept
 * (spec Part 5C — gradients are decorative, not theme-mapped). All
 * chrome uses theme tokens.
 */
export default function StorefrontHero({ instructor, language }: StorefrontHeroProps) {
  const sportTag = instructor.specialties?.[0];

  return (
    <div className="relative">
      {/* Banner */}
      <div className="relative h-44 sm:h-56 md:h-64 overflow-hidden bg-tribe-dark">
        {instructor.storefront_banner_url ? (
          <Image src={instructor.storefront_banner_url} alt="" fill className="object-cover" unoptimized priority />
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-tribe-dark via-tribe-surface to-tribe-dark" />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 30% 50%, rgba(132,204,22,0.18) 0%, transparent 55%)' }}
            />
          </>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
      </div>

      {/* Identity block — overlaps the banner */}
      <div className="px-4 md:px-6">
        <div className="-mt-12 flex items-end gap-4">
          <div className="relative flex-shrink-0">
            <Image
              src={instructor.avatar_url || 'https://via.placeholder.com/96'}
              alt={instructor.name}
              width={96}
              height={96}
              className="w-24 h-24 rounded-2xl border-4 border-theme-page object-cover bg-theme-card"
              unoptimized
            />
            {instructor.verified && (
              <div className="absolute -bottom-1 -right-1 bg-tribe-green rounded-full p-1 border-2 border-theme-page">
                <Check className="w-3.5 h-3.5 text-slate-900" />
              </div>
            )}
          </div>
          <div className="min-w-0 pb-1">
            {sportTag && (
              <span className="inline-block bg-tribe-green/20 text-tribe-green px-2 py-0.5 rounded-full text-xs font-semibold mb-1">
                {sportTag}
              </span>
            )}
            <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary truncate">{instructor.name}</h1>
          </div>
        </div>

        {instructor.tagline && <p className="mt-2 text-sm text-theme-secondary line-clamp-2">{instructor.tagline}</p>}
        <div className="mt-1 flex items-center gap-1 text-xs text-theme-secondary">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {instructor.location || (language === 'es' ? 'Ubicación no especificada' : 'Location not specified')}
          </span>
        </div>
      </div>
    </div>
  );
}
