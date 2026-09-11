'use client';

/**
 * The gym/studio identity chip (T-GYM1).
 *
 * THE IDENTITY RULE: people are circles, organizations are rounded squares. A
 * gym's logo is never a circle at any size. That single convention does most of
 * the work of telling "this is a gym" from "this is a trainer"; the type label
 * beside it reinforces it for anyone who does not read shape as meaning.
 *
 * The monogram fallback is not decoration. Both live partners have a null
 * logo_url, so until a gym uploads one this is the only branch that renders,
 * and it still has to read as an organization rather than as a missing image.
 */

import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/useTranslations';

export interface GymChipProps {
  name: string;
  type: 'gym' | 'studio';
  logoUrl?: string | null;
  size?: 'sm' | 'md';
  /** Links to the gym's storefront. Omitted inside an existing link. */
  href?: string;
  /** Translucent white plate, for placement over a session photo. */
  overPhoto?: boolean;
}

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export default function GymChip({ name, type, logoUrl, size = 'sm', href, overPhoto = false }: GymChipProps) {
  const t = useTranslations('partner');
  const typeLabel = type === 'studio' ? t('typeStudio') : t('typeGym');

  const logoBox = size === 'sm' ? 'w-[26px] h-[26px] rounded-md' : 'w-10 h-10 rounded-lg';
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-sm';

  const body = (
    <>
      {logoUrl ? (
        <img src={logoUrl} alt="" className={`${logoBox} object-cover flex-shrink-0`} loading="lazy" decoding="async" />
      ) : (
        <span
          aria-hidden="true"
          className={`${logoBox} flex-shrink-0 bg-tribe-dark text-tribe-green flex items-center justify-center font-bold ${
            size === 'sm' ? 'text-[10px]' : 'text-xs'
          }`}
        >
          {monogram(name)}
        </span>
      )}
      <span className="min-w-0 flex flex-col leading-tight">
        <span className={`${textSize} font-semibold truncate`}>{name}</span>
        <span className={`${size === 'sm' ? 'text-[9px]' : 'text-[10px]'} font-bold tracking-wide opacity-70`}>
          {typeLabel.toUpperCase()}
        </span>
      </span>
    </>
  );

  const plate = overPhoto ? 'bg-white/85 text-slate-900 backdrop-blur-sm' : 'bg-theme-inset text-theme-primary';
  const className = `inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg max-w-[70%] ${plate}`;
  const label = `${name}, ${typeLabel.toLowerCase()}`;

  if (href) {
    return (
      <Link href={href} aria-label={label} onClick={(e) => e.stopPropagation()} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <span aria-label={label} className={className}>
      {body}
    </span>
  );
}
