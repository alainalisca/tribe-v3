'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Check, MapPin } from 'lucide-react';
import type { Instructor } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontHeroProps {
  instructor: Instructor;
  language: 'en' | 'es';
}

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return (
    parts
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}

/**
 * Full-width hero (spec 6A/6B): short banner, instructor photo (with a
 * robust initials fallback — no external placeholder), sport tag,
 * verified badge, name + location. Identity row is laid out so avatar,
 * name and sport chip never overlap, even with short/junk values.
 * Decorative gradient kept per spec Part 5C. Theme tokens only.
 */
export default function StorefrontHero({ instructor, language }: StorefrontHeroProps) {
  const sportTag = instructor.specialties?.[0];
  const [imgError, setImgError] = useState(false);
  const showImage = !!instructor.avatar_url && !imgError;

  return (
    <div className="relative">
      {/* Banner — kept short so it doesn't dominate on wide screens */}
      <div className="relative h-32 sm:h-40 md:h-44 overflow-hidden bg-tribe-dark rounded-b-2xl">
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
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
      </div>

      {/* Identity */}
      <div className="px-4 md:px-6">
        <div className="-mt-10 flex items-end gap-4">
          <div className="relative flex-shrink-0">
            {showImage ? (
              <Image
                src={instructor.avatar_url}
                alt={instructor.name}
                width={88}
                height={88}
                onError={() => setImgError(true)}
                className="w-[88px] h-[88px] rounded-2xl border-4 border-theme-page object-cover bg-theme-card"
                unoptimized
              />
            ) : (
              <div className="w-[88px] h-[88px] rounded-2xl border-4 border-theme-page bg-tribe-green/15 flex items-center justify-center">
                <span className="text-2xl font-extrabold text-tribe-green">{initialsOf(instructor.name)}</span>
              </div>
            )}
            {instructor.verified && (
              <div className="absolute -bottom-1 -right-1 bg-tribe-green rounded-full p-1 border-2 border-theme-page">
                <Check className="w-3.5 h-3.5 text-slate-900" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            {/* BUG-027: capitalize so lowercase test/legacy display names
                (e.g. 'tribe') don't read as broken on the storefront header. */}
            <h1 className="text-2xl font-extrabold tracking-tight text-theme-primary truncate capitalize">
              {instructor.name}
            </h1>
            {instructor.verified && (
              <p className="text-tribe-green text-xs font-semibold">
                ✓ {language === 'es' ? 'Verificado' : 'Verified'}
              </p>
            )}
          </div>
        </div>

        {sportTag && (
          <div className="mt-3">
            <span className="inline-block bg-tribe-green/20 text-tribe-green px-2.5 py-0.5 rounded-full text-xs font-semibold">
              {sportTag}
            </span>
          </div>
        )}
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
