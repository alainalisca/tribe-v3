'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchRevenueMetrics, RevenueMetrics } from '@/lib/dal/admin-revenue';
import { logError } from '@/lib/logger';
import { DollarSign, TrendingUp, RefreshCw, AlertTriangle } from 'lucide-react';

interface AdminRevenueTabProps {
  language: string;
}

export function AdminRevenueTab({ language }: AdminRevenueTabProps) {
  const supabase = createClient();
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const isEs = language === 'es';

  useEffect(() => {
    loadMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadMetrics() {
    setLoading(true);
    const result = await fetchRevenueMetrics(supabase);
    if (result.success && result.data) {
      setMetrics(result.data);
    } else {
      logError(new Error(result.error || 'Failed to load revenue'), { action: 'AdminRevenueTab' });
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="text-center py-8 text-stone-500">{isEs ? 'Cargando...' : 'Loading...'}</div>;
  }

  if (!metrics) {
    return (
      <div className="text-center py-8 text-stone-500">
        {isEs ? 'No se pudieron cargar las metricas' : 'Failed to load metrics'}
      </div>
    );
  }

  const formatUsd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const formatCop = (cents: number) => `$${(cents / 100).toLocaleString('es-CO', { minimumFractionDigits: 0 })} COP`;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-600" />
            <span className="text-xs text-stone-500">{isEs ? 'Comisiones USD' : 'USD Fees'}</span>
          </div>
          <p className="text-lg font-bold text-tribe-dark">{formatUsd(metrics.total_platform_fees_usd_cents)}</p>
        </div>
        <div className="bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <span className="text-xs text-stone-500">{isEs ? 'Comisiones COP' : 'COP Fees'}</span>
          </div>
          <p className="text-lg font-bold text-tribe-dark">{formatCop(metrics.total_platform_fees_cop_cents)}</p>
        </div>
        <div className="bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-tribe-green" />
            <span className="text-xs text-stone-500">{isEs ? 'Pagos Exitosos' : 'Successful Payments'}</span>
          </div>
          <p className="text-lg font-bold text-tribe-dark">{metrics.total_payments_count}</p>
        </div>
        <div className="bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-stone-500">{isEs ? 'Reembolsos' : 'Refunds'}</span>
          </div>
          <p className="text-lg font-bold text-tribe-dark">{metrics.total_refunds_count}</p>
        </div>
        {metrics.total_failed_count > 0 && (
          <div className="bg-white dark:bg-tribe-surface border border-red-200 dark:border-red-800 rounded-xl p-4 col-span-2">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-500">{isEs ? 'Pagos Fallidos' : 'Failed Payments'}</span>
            </div>
            <p className="text-lg font-bold text-red-600">{metrics.total_failed_count}</p>
          </div>
        )}
      </div>

      {/* Monthly Breakdown */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h3 className="text-sm font-bold text-tribe-dark mb-3">
          {isEs ? 'Ingresos Mensuales' : 'Monthly Revenue'}
        </h3>
        {metrics.monthly_revenue.length === 0 ? (
          <p className="text-sm text-stone-500">{isEs ? 'Sin datos aun' : 'No data yet'}</p>
        ) : (
          <div className="space-y-2">
            {metrics.monthly_revenue.map((m) => (
              <div key={m.month} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-tribe-dark">{m.month}</p>
                  <p className="text-xs text-stone-500">
                    {m.payment_count} {isEs ? 'pagos' : 'payments'}
                  </p>
                </div>
                <div className="text-right">
                  {m.usd_fees > 0 && <p className="text-sm font-medium text-green-600">{formatUsd(m.usd_fees)}</p>}
                  {m.cop_fees > 0 && <p className="text-sm font-medium text-blue-600">{formatCop(m.cop_fees)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
