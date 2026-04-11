'use client';

import { Star } from 'lucide-react';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';

interface Props {
  partner: FeaturedPartner;
  language: string;
}

export default function PartnerStorefrontBadge({ partner, language }: Props) {
  const sinceDate = partner.starts_at
    ? new Date(partner.starts_at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
        month: 'short',
        year: 'numeric',
      })
    : new Date(partner.created_at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', {
        month: 'short',
        year: 'numeric',
      });

  return (
    <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-xs font-bold px-3 py-1.5 rounded-full mb-3">
      <Star className="w-3.5 h-3.5 fill-tribe-green" />
      {language === 'es' ? 'Socio Destacado' : 'Featured Partner'}
      <span className="text-tribe-green/70 font-normal">
        &middot; {language === 'es' ? 'Desde' : 'Since'} {sinceDate}
      </span>
    </div>
  );
}
