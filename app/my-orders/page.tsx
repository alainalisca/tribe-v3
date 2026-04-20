'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ShoppingBag } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import EmptyState from '@/components/EmptyState';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Download, Ticket } from 'lucide-react';

interface BuyerOrder {
  id: string;
  quantity: number;
  total_cents: number;
  currency: string;
  fulfillment_status: string;
  created_at: string;
  credits_remaining?: number;
  credits_expire_at?: string;
  product?: {
    id: string;
    title: string;
    title_es?: string;
    product_type: string;
    images: string[];
    thumbnail_url?: string;
    session_credits?: number;
  };
}

export default function MyOrdersPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }

      const { data } = await supabase
        .from('product_orders')
        .select('*, product:products(id, title, title_es, product_type, images, thumbnail_url, session_credits)')
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (data) {
        const mapped = data.map((o: Record<string, unknown>) => ({
          ...o,
          product: Array.isArray(o.product) ? o.product[0] : o.product,
        })) as BuyerOrder[];
        setOrders(mapped);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getStatusBadge(status: string) {
    if (status === 'fulfilled') {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-transparent text-xs">
          {language === 'es' ? 'Completada' : 'Fulfilled'}
        </Badge>
      );
    }
    if (status === 'cancelled') {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-transparent text-xs">
          {language === 'es' ? 'Cancelada' : 'Cancelled'}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-transparent text-xs">
        {language === 'es' ? 'Pendiente' : 'Pending'}
      </Badge>
    );
  }

  const title = (order: BuyerOrder) => {
    const p = order.product;
    if (!p) return language === 'es' ? 'Producto' : 'Product';
    return language === 'es' && p.title_es ? p.title_es : p.title;
  };

  const imageUrl = (order: BuyerOrder) => order.product?.thumbnail_url || order.product?.images?.[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
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
          <h1 className="text-xl font-bold text-theme-primary">{language === 'es' ? 'Mis Compras' : 'My Orders'}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-3">
        {orders.length === 0 ? (
          <EmptyState
            Icon={ShoppingBag}
            title={language === 'es' ? 'Sin compras aún' : 'No purchases yet'}
            subtitle={
              language === 'es'
                ? 'Explora los perfiles de instructores para encontrar productos.'
                : 'Explore instructor profiles to find products.'
            }
            cta={{
              label: language === 'es' ? 'Explorar' : 'Explore',
              href: '/',
            }}
          />
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="border-stone-200 dark:border-tribe-mid">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-stone-200 dark:bg-tribe-surface flex-shrink-0">
                    {imageUrl(order) ? (
                      <Image
                        src={imageUrl(order)!}
                        alt={title(order)}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">{'\uD83D\uDCE6'}</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-theme-primary truncate">{title(order)}</p>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      {new Date(order.created_at).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold text-theme-primary">
                        {formatPrice(order.total_cents, order.currency as Currency)}
                      </span>
                      {getStatusBadge(order.fulfillment_status)}
                    </div>
                  </div>
                </div>

                {/* Digital download */}
                {order.product?.product_type === 'digital' && order.fulfillment_status === 'fulfilled' && (
                  <a
                    href={`/api/products/download/${order.id}`}
                    className="flex items-center justify-center gap-2 mt-3 py-2 bg-tribe-green/10 text-tribe-green rounded-xl text-sm font-semibold hover:bg-tribe-green/20 transition"
                  >
                    <Download className="w-4 h-4" />
                    {language === 'es' ? 'Descargar' : 'Download'}
                  </a>
                )}

                {/* Package credits */}
                {order.product?.product_type === 'package' && (
                  <div className="flex items-center gap-2 mt-3 py-2 px-3 bg-tribe-green/10 rounded-xl">
                    <Ticket className="w-4 h-4 text-tribe-green flex-shrink-0" />
                    <p className="text-xs text-theme-primary">
                      <span className="font-bold">{order.credits_remaining ?? order.product.session_credits ?? 0}</span>{' '}
                      {language === 'es' ? 'cr\u00E9ditos restantes' : 'credits remaining'}
                      {order.credits_expire_at && (
                        <>
                          {' \u00B7 '}
                          {language === 'es' ? 'Expira' : 'Expires'}{' '}
                          {new Date(order.credits_expire_at).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </>
                      )}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
