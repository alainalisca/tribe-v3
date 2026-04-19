'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { trackEvent } from '@/lib/analytics';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, DollarSign, Clock, Package, CheckCircle } from 'lucide-react';

interface Order {
  id: string;
  quantity: number;
  total_cents: number;
  currency: string;
  fulfillment_status: string;
  created_at: string;
  product?: { id: string; title: string; product_type: string };
  variant?: { name: string } | null;
  buyer?: { id: string; name: string; avatar_url: string };
}

type TabId = 'pending' | 'completed' | 'all';

export default function OrdersDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [currency, setCurrency] = useState<Currency>('COP');

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOrders() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
      return;
    }

    const { data } = await supabase
      .from('product_orders')
      .select(
        '*, product:products(id, title, product_type), variant:product_variants(name), buyer:users!product_orders_buyer_id_fkey(id, name, avatar_url)'
      )
      .eq('instructor_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      const mapped = data.map((o: Record<string, unknown>) => ({
        ...o,
        product: Array.isArray(o.product) ? o.product[0] : o.product,
        variant: Array.isArray(o.variant) ? o.variant[0] : o.variant,
        buyer: Array.isArray(o.buyer) ? o.buyer[0] : o.buyer,
      })) as Order[];
      setOrders(mapped);

      // Calculate month revenue
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthTotal = mapped
        .filter((o) => o.fulfillment_status !== 'cancelled' && o.created_at >= monthStart)
        .reduce((sum, o) => sum + o.total_cents, 0);
      setMonthRevenue(monthTotal);
      if (mapped.length > 0) setCurrency(mapped[0].currency as Currency);
    }
    setLoading(false);
  }

  async function handleMarkFulfilled(orderId: string) {
    const { error } = await supabase
      .from('product_orders')
      .update({ fulfillment_status: 'fulfilled' })
      .eq('id', orderId);

    if (error) {
      showError(error.message);
      return;
    }

    trackEvent('product_order_fulfilled', { order_id: orderId });
    showSuccess(language === 'es' ? 'Orden completada' : 'Order fulfilled');
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, fulfillment_status: 'fulfilled' } : o)));
  }

  const filtered =
    activeTab === 'all'
      ? orders
      : activeTab === 'pending'
        ? orders.filter((o) => o.fulfillment_status === 'pending')
        : orders.filter((o) => o.fulfillment_status === 'fulfilled');

  const pendingCount = orders.filter((o) => o.fulfillment_status === 'pending').length;

  const tabs: { id: TabId; en: string; es: string }[] = [
    { id: 'pending', en: `Pending (${pendingCount})`, es: `Pendientes (${pendingCount})` },
    { id: 'completed', en: 'Completed', es: 'Completadas' },
    { id: 'all', en: `All (${orders.length})`, es: `Todas (${orders.length})` },
  ];

  const statusBadge = (status: string) => {
    if (status === 'fulfilled') {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-transparent">
          {language === 'es' ? 'Completada' : 'Fulfilled'}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-transparent">
        {language === 'es' ? 'Pendiente' : 'Pending'}
      </Badge>
    );
  };

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
          <Link href="/earnings">
            <Button variant="ghost" size="icon" className="mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">
            {language === 'es' ? 'Pedidos de Productos' : 'Product Orders'}
          </h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-tribe-green/30">
            <CardContent className="p-3 text-center">
              <DollarSign className="w-5 h-5 text-tribe-green mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{formatPrice(monthRevenue, currency)}</p>
              <p className="text-[10px] text-theme-secondary">{language === 'es' ? 'Este mes' : 'This month'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{pendingCount}</p>
              <p className="text-[10px] text-theme-secondary">{language === 'es' ? 'Pendientes' : 'Pending'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Package className="w-5 h-5 text-theme-secondary mx-auto mb-1" />
              <p className="text-lg font-bold text-theme-primary">{orders.length}</p>
              <p className="text-[10px] text-theme-secondary">{language === 'es' ? 'Total' : 'Total'}</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 md:justify-center md:overflow-visible md:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-semibold transition-colors whitespace-nowrap rounded-xl text-sm ${
                activeTab === tab.id
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300'
              }`}
            >
              {language === 'es' ? tab.es : tab.en}
            </button>
          ))}
        </div>

        {/* Order list */}
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">{'\uD83D\uDCE6'}</p>
            <p className="text-theme-secondary text-sm">{language === 'es' ? 'No hay pedidos' : 'No orders yet'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => (
              <Card key={order.id} className="border-stone-200 dark:border-tribe-mid">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarImage src={order.buyer?.avatar_url} alt={order.buyer?.name || ''} />
                        <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-sm">
                          {order.buyer?.name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-theme-primary truncate">
                          {order.buyer?.name || (language === 'es' ? 'Desconocido' : 'Unknown')}
                        </p>
                        <p className="text-xs text-theme-secondary truncate">
                          {order.product?.title}
                          {order.variant?.name ? ` \u00B7 ${order.variant.name}` : ''}
                          {order.quantity > 1 ? ` \u00D7${order.quantity}` : ''}
                        </p>
                        <p className="text-xs text-theme-secondary mt-0.5">
                          {new Date(order.created_at).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-sm font-bold text-theme-primary">
                        {formatPrice(order.total_cents, order.currency as Currency)}
                      </p>
                      {statusBadge(order.fulfillment_status)}
                    </div>
                  </div>

                  {order.fulfillment_status === 'pending' && (
                    <Button
                      onClick={() => handleMarkFulfilled(order.id)}
                      className="w-full mt-3 bg-tribe-green text-slate-900 hover:bg-tribe-green-hover font-bold text-sm"
                      size="sm"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {language === 'es' ? 'Marcar como Completada' : 'Mark Fulfilled'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
