'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Clock } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface ProductCardProps {
  product: {
    id: string;
    title: string;
    title_es?: string;
    price_cents: number;
    currency: string;
    compare_at_price_cents?: number;
    images: string[];
    product_type: string;
    status: string;
    track_inventory?: boolean;
    total_inventory?: number;
    purchase_window_end?: string;
    category?: string;
    thumbnail_url?: string;
  };
  language: 'en' | 'es';
  onPress: () => void;
  showInstructor?: boolean;
  instructor?: { name: string; avatar_url: string };
}

const CATEGORY_EMOJI: Record<string, string> = {
  apparel: '\uD83D\uDC55',
  equipment: '\uD83C\uDFCB\uFE0F',
  supplements: '\uD83D\uDCAA',
  accessories: '\uD83C\uDFBD',
  default: '\uD83D\uDCE6',
};

const TYPE_LABELS: Record<string, { en: string; es: string }> = {
  physical: { en: 'Merch', es: 'Mercanc\u00EDa' },
  digital: { en: 'Training Plan', es: 'Plan de Entrenamiento' },
  package: { en: 'Session Pack', es: 'Paquete de Sesiones' },
};

function useCountdown(endDate?: string): string | null {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);

  useEffect(() => {
    if (!endDate) return;
    const end = new Date(endDate).getTime();

    function calc() {
      const diff = end - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setTimeLeft(h > 0 ? `${h}h ${m}m` : `${m}m`);
    }

    calc();
    const interval = setInterval(calc, 60000);
    return () => clearInterval(interval);
  }, [endDate]);

  return timeLeft;
}

export default function ProductCard({ product, language, onPress, showInstructor, instructor }: ProductCardProps) {
  const isSoldOut = product.status === 'sold_out' || (product.track_inventory && (product.total_inventory ?? 0) <= 0);

  const countdown = useCountdown(product.purchase_window_end);
  const title = language === 'es' && product.title_es ? product.title_es : product.title;
  const typeLabel = TYPE_LABELS[product.product_type]?.[language] ?? product.product_type;
  const imageUrl = product.thumbnail_url || product.images?.[0];
  const emoji = CATEGORY_EMOJI[product.category ?? 'default'] || CATEGORY_EMOJI.default;

  return (
    <div onClick={isSoldOut ? undefined : onPress} className={isSoldOut ? '' : 'cursor-pointer'}>
      <Card className="dark:bg-tribe-card shadow-none hover:shadow-sm transition-shadow duration-200 overflow-hidden border-stone-200 dark:border-gray-600/30">
        <div className="relative">
          {/* Image */}
          {imageUrl ? (
            <div className="relative h-40 w-full bg-stone-200 dark:bg-tribe-surface">
              <Image src={imageUrl} alt={title} fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="h-40 w-full bg-stone-200 dark:bg-tribe-surface flex items-center justify-center">
              <span className="text-5xl">{emoji}</span>
            </div>
          )}

          {/* Sold Out overlay */}
          {isSoldOut && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white font-bold text-lg">{language === 'es' ? 'Agotado' : 'Sold Out'}</span>
            </div>
          )}

          {/* Type badge */}
          <Badge className="absolute top-2 left-2 bg-tribe-green text-slate-900 border-transparent text-xs font-bold">
            {typeLabel}
          </Badge>

          {/* Countdown */}
          {countdown && (
            <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {countdown}
            </div>
          )}
        </div>

        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-theme-primary line-clamp-1 mb-1">{title}</h3>

          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-tribe-green">
              {formatPrice(product.price_cents, product.currency as Currency)}
            </span>
            {product.compare_at_price_cents && product.compare_at_price_cents > product.price_cents && (
              <span className="text-xs text-theme-secondary line-through">
                {formatPrice(product.compare_at_price_cents, product.currency as Currency)}
              </span>
            )}
          </div>

          {/* Instructor mini row */}
          {showInstructor && instructor && (
            <div className="flex items-center gap-2 mt-2">
              <Avatar className="w-5 h-5">
                <AvatarImage src={instructor.avatar_url} alt={instructor.name} />
                <AvatarFallback className="bg-tribe-green text-slate-900 text-[10px] font-bold">
                  {instructor.name?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-theme-secondary truncate">{instructor.name}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
