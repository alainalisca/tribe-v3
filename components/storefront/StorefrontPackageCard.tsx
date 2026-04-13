'use client';

import { MessageCircle } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface ServicePackage {
  id: string;
  name: string;
  description: string;
  price: number;
  session_count?: number;
  duration?: string;
  instructor_id: string;
  is_active: boolean;
  tag?: string;
  currency?: string;
  price_cents?: number;
}

interface StorefrontPackageCardProps {
  pkg: ServicePackage;
  language: 'en' | 'es';
  instructorId: string;
}

export default function StorefrontPackageCard({
  pkg,
  language,
  instructorId,
}: StorefrontPackageCardProps): React.JSX.Element {
  const currency = (pkg.currency || 'COP') as Currency;

  const priceDisplay = pkg.price_cents
    ? `${formatPrice(pkg.price_cents, currency)} ${currency}`
    : `$${pkg.price.toLocaleString(currency === 'COP' ? 'es-CO' : 'en-US', { maximumFractionDigits: currency === 'COP' ? 0 : 2 })} ${currency}`;

  const t = {
    sessions: language === 'es' ? 'Sesiones' : 'Sessions',
    duration: language === 'es' ? 'Duracion' : 'Duration',
    bookPackage: language === 'es' ? 'Reservar Paquete' : 'Book Package',
  };

  // TODO: Future — implement direct package purchasing via payment gateway.
  // For now, link to messaging since packages often need customization.
  function handleBookPackage(): void {
    window.location.href = `/messages?to=${instructorId}&context=package:${pkg.id}`;
  }

  return (
    <div className="bg-white dark:bg-[#404549] rounded-xl border border-stone-200 dark:border-[#52575D] p-4 hover:border-tribe-green/50 transition-all">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-base font-bold text-theme-primary flex-1">{pkg.name}</h3>
        {pkg.tag && (
          <span className="bg-tribe-green/20 text-tribe-green px-2 py-0.5 rounded-full text-xs font-semibold ml-2 flex-shrink-0">
            {pkg.tag}
          </span>
        )}
      </div>

      <p className="text-theme-secondary text-sm mb-3">{pkg.description}</p>

      <div className="space-y-1 mb-4 text-xs text-theme-secondary">
        {pkg.session_count && (
          <div>
            {t.sessions}: <span className="font-semibold text-theme-primary">{pkg.session_count}</span>
          </div>
        )}
        {pkg.duration && (
          <div>
            {t.duration}: <span className="font-semibold text-theme-primary">{pkg.duration}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-stone-200 dark:border-gray-700">
        <span className="text-lg font-bold text-tribe-green">{priceDisplay}</span>
        <button
          onClick={handleBookPackage}
          className="bg-tribe-green text-slate-900 px-3 py-1.5 rounded-xl font-semibold hover:bg-tribe-green transition-all text-xs flex items-center gap-1.5"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {t.bookPackage}
        </button>
      </div>
    </div>
  );
}
