/** DAL: admin revenue metrics — payment analytics for admin dashboard */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface RevenueMetrics {
  total_platform_fees_usd_cents: number;
  total_platform_fees_cop_cents: number;
  total_payments_count: number;
  total_refunds_count: number;
  total_failed_count: number;
  monthly_revenue: Array<{
    month: string;
    usd_fees: number;
    cop_fees: number;
    payment_count: number;
  }>;
}

export async function fetchRevenueMetrics(supabase: SupabaseClient): Promise<DalResult<RevenueMetrics>> {
  try {
    // Fetch all approved payments
    const { data: approvedPayments, error: approvedErr } = await supabase
      .from('payments')
      .select('amount_cents, currency, platform_fee_cents, created_at')
      .eq('status', 'approved');

    if (approvedErr) return { success: false, error: approvedErr.message };

    // Fetch refund and failed counts
    const { count: refundCount, error: refundErr } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'refunded');

    if (refundErr) return { success: false, error: refundErr.message };

    const { count: failedCount, error: failedErr } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['declined', 'error', 'refund_failed']);

    if (failedErr) return { success: false, error: failedErr.message };

    // Calculate totals
    let totalUsdFees = 0;
    let totalCopFees = 0;

    // Build monthly breakdown
    const monthlyMap = new Map<string, { usd_fees: number; cop_fees: number; payment_count: number }>();

    for (const p of approvedPayments || []) {
      const fee = p.platform_fee_cents || 0;
      const month = (p.created_at as string).slice(0, 7); // YYYY-MM

      if (p.currency === 'USD') {
        totalUsdFees += fee;
      } else {
        totalCopFees += fee;
      }

      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { usd_fees: 0, cop_fees: 0, payment_count: 0 });
      }
      const entry = monthlyMap.get(month)!;
      if (p.currency === 'USD') {
        entry.usd_fees += fee;
      } else {
        entry.cop_fees += fee;
      }
      entry.payment_count++;
    }

    const monthly_revenue = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => b.month.localeCompare(a.month));

    return {
      success: true,
      data: {
        total_platform_fees_usd_cents: totalUsdFees,
        total_platform_fees_cop_cents: totalCopFees,
        total_payments_count: (approvedPayments || []).length,
        total_refunds_count: refundCount ?? 0,
        total_failed_count: failedCount ?? 0,
        monthly_revenue,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchRevenueMetrics' });
    return { success: false, error: 'Failed to fetch revenue metrics' };
  }
}
