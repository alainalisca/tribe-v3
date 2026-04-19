'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import BottomNav from '@/components/BottomNav';
import ProductImageCarousel from '@/components/products/ProductImageCarousel';
import VariantSelector from '@/components/products/VariantSelector';
import FulfillmentInfo from '@/components/products/FulfillmentInfo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, Minus, Plus, Clock } from 'lucide-react';

interface Variant {
  id: string;
  name: string;
  name_es?: string;
  price_cents?: number;
  inventory_count?: number;
  is_active?: boolean;
}

interface Product {
  id: string;
  title: string;
  title_es?: string;
  description?: string;
  description_es?: string;
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
  has_variants?: boolean;
  pickup_instructions?: string;
  session_credits?: number;
  valid_days?: number;
  instructor_id?: string;
  product_variants?: Variant[];
}

interface Instructor {
  id: string;
  name: string;
  avatar_url: string;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const productId = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variants(*)')
        .eq('id', productId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setProduct(data as Product);

      if (data.instructor_id) {
        const { data: inst } = await supabase
          .from('users')
          .select('id, name, avatar_url')
          .eq('id', data.instructor_id)
          .single();
        if (inst) setInstructor(inst as Instructor);
      }

      if (data.has_variants && data.product_variants?.length > 0) {
        const first = data.product_variants.find((v: Variant) => v.is_active !== false);
        if (first) setSelectedVariantId(first.id);
      }

      setLoading(false);
    }
    load();
  }, [productId, supabase]);

  const maxQty = product?.track_inventory ? Math.max(1, product.total_inventory ?? 1) : 99;
  const title = product ? (language === 'es' && product.title_es ? product.title_es : product.title) : '';
  const description = product
    ? language === 'es' && product.description_es
      ? product.description_es
      : product.description
    : '';

  const selectedVariant = product?.product_variants?.find((v) => v.id === selectedVariantId);
  const effectivePrice = selectedVariant?.price_cents ?? product?.price_cents ?? 0;
  const currency = (product?.currency ?? 'USD') as Currency;

  const isSoldOut =
    product?.status === 'sold_out' || (product?.track_inventory && (product?.total_inventory ?? 0) <= 0);

  const windowEnd = product?.purchase_window_end ? new Date(product.purchase_window_end) : null;
  const windowActive = windowEnd ? windowEnd.getTime() > Date.now() : false;

  async function handleBuy() {
    if (!product) return;
    setBuying(true);
    try {
      const res = await fetch('/api/products/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          variant_id: selectedVariantId,
          quantity,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Order failed');

      trackEvent('product_purchased', {
        product_id: product.id,
        product_type: product.product_type,
        price_cents: effectivePrice * quantity,
        currency: product.currency,
      });
      showSuccess(language === 'es' ? 'Compra exitosa' : 'Purchase successful');
      router.push('/my-orders');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      showError(msg);
    } finally {
      setBuying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-theme-page pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
          <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
            <button onClick={() => router.back()}>
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <p className="text-theme-secondary">{language === 'es' ? 'Producto no encontrado' : 'Product not found'}</p>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <button onClick={() => router.back()} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-lg font-bold text-theme-primary truncate">{title}</h1>
        </div>
      </div>

      <div className="pt-14 max-w-2xl md:max-w-4xl mx-auto">
        {/* Image carousel */}
        <ProductImageCarousel images={product.images ?? []} title={title} />

        <div className="p-4 space-y-4">
          {/* Purchase window banner */}
          {windowActive && windowEnd && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                {language === 'es' ? 'Oferta disponible hasta' : 'Available until'}{' '}
                {windowEnd.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}

          {/* Title + Price */}
          <div>
            <h2 className="text-xl font-bold text-theme-primary">{title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl font-bold text-tribe-green">{formatPrice(effectivePrice, currency)}</span>
              {product.compare_at_price_cents && product.compare_at_price_cents > effectivePrice && (
                <span className="text-base text-theme-secondary line-through">
                  {formatPrice(product.compare_at_price_cents, currency)}
                </span>
              )}
            </div>
          </div>

          {/* Variants */}
          {product.has_variants && product.product_variants && product.product_variants.length > 0 && (
            <VariantSelector
              variants={product.product_variants}
              selectedId={selectedVariantId}
              onSelect={setSelectedVariantId}
              language={language as 'en' | 'es'}
            />
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-theme-primary">{language === 'es' ? 'Cantidad' : 'Quantity'}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-tribe-surface flex items-center justify-center"
              >
                <Minus className="w-4 h-4 text-theme-primary" />
              </button>
              <span className="text-lg font-bold text-theme-primary w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-tribe-surface flex items-center justify-center"
              >
                <Plus className="w-4 h-4 text-theme-primary" />
              </button>
              {product.track_inventory && (
                <span className="text-xs text-theme-secondary ml-2">
                  {product.total_inventory} {language === 'es' ? 'disponibles' : 'available'}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {description && (
            <div>
              <p className="text-sm font-semibold text-theme-primary mb-1">
                {language === 'es' ? 'Descripci\u00F3n' : 'Description'}
              </p>
              <p className="text-sm text-theme-secondary leading-relaxed">{description}</p>
            </div>
          )}

          {/* Fulfillment info */}
          <FulfillmentInfo
            productType={product.product_type}
            pickupInstructions={product.pickup_instructions}
            sessionCredits={product.session_credits}
            validDays={product.valid_days}
            language={language as 'en' | 'es'}
          />

          {/* Buy button */}
          <Button
            onClick={handleBuy}
            disabled={buying || isSoldOut}
            className="w-full py-4 bg-tribe-green text-slate-900 hover:bg-tribe-green-hover font-bold text-base"
          >
            {isSoldOut
              ? language === 'es'
                ? 'Agotado'
                : 'Sold Out'
              : buying
                ? language === 'es'
                  ? 'Procesando...'
                  : 'Processing...'
                : `${language === 'es' ? 'Comprar' : 'Buy Now'} \u2014 ${formatPrice(effectivePrice * quantity, currency)}`}
          </Button>

          {/* Instructor card */}
          {instructor && (
            <Link href={`/storefront/${instructor.id}`}>
              <div className="flex items-center gap-3 bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-gray-700 p-4 mt-2">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={instructor.avatar_url} alt={instructor.name} />
                  <AvatarFallback className="bg-tribe-green text-slate-900 font-bold">
                    {instructor.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-theme-primary">{instructor.name}</p>
                  <p className="text-xs text-theme-secondary">{language === 'es' ? 'Ver perfil' : 'View profile'}</p>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
