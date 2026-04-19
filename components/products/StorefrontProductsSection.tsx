'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import ProductCard from './ProductCard';
import Link from 'next/link';
import { Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Product {
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
}

interface StorefrontProductsSectionProps {
  instructorId: string;
  isOwnProfile?: boolean;
}

type FilterTab = 'all' | 'physical' | 'digital' | 'package';

const FILTER_TABS: { id: FilterTab; en: string; es: string }[] = [
  { id: 'all', en: 'All', es: 'Todos' },
  { id: 'physical', en: 'Merch', es: 'Mercanc\u00EDa' },
  { id: 'digital', en: 'Training Plans', es: 'Planes' },
  { id: 'package', en: 'Session Packs', es: 'Paquetes' },
];

export default function StorefrontProductsSection({
  instructorId,
  isOwnProfile = false,
}: StorefrontProductsSectionProps) {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  useEffect(() => {
    async function fetchProducts() {
      setLoading(true);
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('instructor_id', instructorId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (data) setProducts(data as Product[]);
      setLoading(false);
    }
    fetchProducts();
  }, [instructorId, supabase]);

  const filtered = activeFilter === 'all' ? products : products.filter((p) => p.product_type === activeFilter);

  const displayProducts = filtered.slice(0, 6);
  const hasMore = filtered.length > 6;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-32 bg-stone-200 dark:bg-tribe-surface rounded animate-pulse" />
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-44 h-56 bg-stone-200 dark:bg-tribe-surface rounded-2xl animate-pulse flex-shrink-0"
            />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <div className="bg-white dark:bg-tribe-card rounded-2xl border border-stone-200 dark:border-gray-700 p-6 text-center">
        <p className="text-4xl mb-3">{'\uD83D\uDCE6'}</p>
        <p className="text-theme-primary font-semibold mb-1">
          {language === 'es' ? 'Agrega tu primer producto' : 'Add your first product'}
        </p>
        <p className="text-theme-secondary text-sm mb-4">
          {language === 'es'
            ? 'Vende mercanc\u00EDa, planes de entrenamiento o paquetes de sesiones.'
            : 'Sell merch, training plans, or session packs.'}
        </p>
        <Link href="/create-product">
          <Button className="bg-tribe-green text-slate-900 hover:bg-tribe-green-hover font-bold">
            <Plus className="w-4 h-4 mr-2" />
            {language === 'es' ? 'Crear Producto' : 'Create Product'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-theme-primary">{language === 'es' ? 'Productos' : 'Products'}</h3>
        {isOwnProfile && (
          <Link href="/create-product">
            <Button variant="ghost" size="sm" className="text-tribe-green font-semibold text-xs">
              <Plus className="w-4 h-4 mr-1" />
              {language === 'es' ? 'Agregar' : 'Add'}
            </Button>
          </Link>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`px-3 py-1.5 font-semibold transition-colors whitespace-nowrap rounded-xl text-xs ${
              activeFilter === tab.id
                ? 'bg-tribe-green text-slate-900'
                : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300'
            }`}
          >
            {language === 'es' ? tab.es : tab.en}
          </button>
        ))}
      </div>

      {/* Horizontal scroll row */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {displayProducts.map((product) => (
          <div key={product.id} className="w-44 flex-shrink-0">
            <ProductCard
              product={product}
              language={language as 'en' | 'es'}
              onPress={() => router.push(`/product/${product.id}`)}
            />
          </div>
        ))}
      </div>

      {/* See All link */}
      {hasMore && (
        <button
          onClick={() => router.push(`/storefront/${instructorId}?tab=products`)}
          className="flex items-center gap-1 text-tribe-green text-sm font-semibold"
        >
          {language === 'es' ? 'Ver Todos' : 'See All'}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
