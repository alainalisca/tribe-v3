/**
 * DAL: unpaid-attendance roll-up (revenue collection workflow).
 *
 * Extracted from lib/dal/clients.ts during the Phase 2 refactor.
 * Re-exported from clients.ts so existing imports stay green.
 *
 * Powers the /os/revenue/unpaid surface — the "who owes me money,
 * sorted by recency of debt" view. Includes a typical-session-price
 * inference per currency so the WhatsApp template can fill in a
 * specific number instead of vague "let's settle up" copy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { Currency } from './clients';

/**
 * One row per client with at least one unpaid (attended but not paid)
 * attendance in the window. Powers the /os/revenue/unpaid surface.
 *
 * We deliberately don't try to compute an "amount owed" — the
 * attendance table only records `amount_paid_cents` (NULL when unpaid),
 * there's no per-session "price list" today. Coaches know their own
 * pricing; the surface answers "who do I need to nudge?" not "send
 * the exact dollar amount."
 */
export interface UnpaidClientGroup {
  client_id: string;
  client_name: string;
  /** Free-form phone. Drives WhatsApp deep links; nullable. */
  client_phone: string | null;
  client_email: string | null;
  /** Number of unpaid (attended, !paid) rows in the window. */
  unpaid_count: number;
  /** Earliest attended_at among the unpaid rows. ISO date string. */
  oldest_unpaid_at: string;
  /** Most recent attended_at among the unpaid rows. ISO date string. */
  newest_unpaid_at: string;
}

export interface ListUnpaidAttendanceOptions {
  /**
   * Look-back window in days. Defaults to 60. Older unpaid sessions
   * are excluded — at some point they're not actionable as a payment
   * reminder, they're write-offs the coach should handle in their
   * books. 60 days strikes the balance: covers a missed month of
   * monthly billing without surfacing year-old debt.
   */
  windowDays?: number;
  /**
   * Look-back window for the "typical session price" inference.
   * Defaults to 180 days — wide enough to get a meaningful sample
   * from a low-volume gym while still excluding ancient prices that
   * may no longer reflect current rates.
   */
  pricingWindowDays?: number;
}

const DEFAULT_UNPAID_WINDOW_DAYS = 60;
const DEFAULT_PRICING_WINDOW_DAYS = 180;
const MIN_PRICING_SAMPLE_SIZE = 3;

/**
 * Result of `listUnpaidAttendance` — the grouped unpaid rows alongside
 * inferred "typical session price" per currency.
 */
export interface UnpaidAttendanceResult {
  groups: UnpaidClientGroup[];
  /**
   * Median paid amount per currency in cents, computed from this gym's
   * own historical paid attendance in the pricing window. Powers a
   * "Typical session: $20 USD" hint on /os/revenue/unpaid + lets the
   * WhatsApp template include a specific number instead of vague
   * "let's settle up" copy.
   *
   * A currency key is present only when we have at least
   * MIN_PRICING_SAMPLE_SIZE paid rows in that currency. Smaller samples
   * produce noisy medians ("your typical session is $1.50 because the
   * only paid row in COP was a typo last March") — better to surface
   * nothing than to surface garbage.
   */
  suggested_amount_cents: Partial<Record<Currency, number>>;
}

/**
 * Compute the median of an integer array. Empty input → null.
 * Uses the lower-middle for even-length arrays — we want a value
 * that exists in the data, not an interpolated one, so the figure
 * we surface reflects a real paid session.
 */
function medianCentsLowerMiddle(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Lower-middle index: for [10, 20, 30, 40] returns sorted[1] = 20.
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * Group every unpaid (attended, !paid) attendance row in the gym
 * into one entry per client, ordered by most-recent unpaid first
 * (the assumption being: a client with a fresh unpaid session is
 * the most likely to pay if nudged today). Also computes a
 * gym-wide typical session price per currency from the same gym's
 * paid history.
 *
 * Scoping comes through RLS — the client_attendance policy already
 * scopes to the caller's clients via the parent client row.
 */
export async function listUnpaidAttendance(
  supabase: SupabaseClient,
  opts: ListUnpaidAttendanceOptions = {}
): Promise<DalResult<UnpaidAttendanceResult>> {
  const windowDays = Math.max(1, Math.floor(opts.windowDays ?? DEFAULT_UNPAID_WINDOW_DAYS));
  const pricingWindowDays = Math.max(1, Math.floor(opts.pricingWindowDays ?? DEFAULT_PRICING_WINDOW_DAYS));
  // Build a cutoff ISO string for the SQL filter. attended_at is the
  // event time; we keep created_at out of the filter so a freshly
  // RECORDED-but-backdated row still shows up.
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const pricingCutoff = new Date(Date.now() - pricingWindowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Parallel: unpaid rows for grouping + paid rows for price
    // inference. RLS scopes both reads to the caller's clients.
    const [unpaidRes, pricingRes] = await Promise.all([
      supabase
        .from('client_attendance')
        .select(
          `
            attended_at, attended, paid, client_id,
            client:clients(id, name, email, phone, archived)
          `
        )
        .eq('attended', true)
        .eq('paid', false)
        .gte('attended_at', cutoff)
        .order('attended_at', { ascending: false, nullsFirst: false }),
      supabase
        .from('client_attendance')
        .select('amount_paid_cents, currency')
        .eq('paid', true)
        .gte('attended_at', pricingCutoff)
        .not('amount_paid_cents', 'is', null)
        .not('currency', 'is', null),
    ]);
    const { data, error } = unpaidRes;
    if (error) {
      logError(error, { action: 'listUnpaidAttendance' });
      return { success: false, error: error.message };
    }
    if (pricingRes.error) {
      // Don't fail the whole request over a pricing read; the page
      // still renders without the typical-price hint.
      logError(pricingRes.error, { action: 'listUnpaidAttendance.pricing' });
    }

    // Group client-side. Could push this into a SQL view, but the
    // expected payload is small (a gym with 30 active members and a
    // 60-day window rarely exceeds a few hundred rows) and the
    // group-by logic stays in TS where the test surface is friendlier.
    const groups = new Map<string, UnpaidClientGroup>();
    for (const row of data ?? []) {
      const client = row.client as unknown as {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        archived: boolean;
      } | null;
      // Skip rows whose parent client was archived — those usually
      // aren't actionable as a payment reminder.
      if (!client || client.archived) continue;
      const attendedAt = (row.attended_at as string | null) ?? '';
      if (!attendedAt) continue;

      const existing = groups.get(client.id);
      if (!existing) {
        groups.set(client.id, {
          client_id: client.id,
          client_name: client.name,
          client_phone: client.phone,
          client_email: client.email,
          unpaid_count: 1,
          oldest_unpaid_at: attendedAt,
          newest_unpaid_at: attendedAt,
        });
      } else {
        existing.unpaid_count += 1;
        if (attendedAt < existing.oldest_unpaid_at) existing.oldest_unpaid_at = attendedAt;
        if (attendedAt > existing.newest_unpaid_at) existing.newest_unpaid_at = attendedAt;
      }
    }

    const result = Array.from(groups.values()).sort((a, b) =>
      // Most-recent unpaid first. Clients with fresh debt are the
      // ones most worth nudging today.
      b.newest_unpaid_at.localeCompare(a.newest_unpaid_at)
    );

    // Bucket paid amounts by currency, then take the median per
    // bucket if we have a meaningful sample. The MIN_PRICING_SAMPLE_SIZE
    // floor protects against absurd values from a one-off price typo.
    const byCurrency = new Map<Currency, number[]>();
    for (const row of pricingRes.data ?? []) {
      const cents = row.amount_paid_cents as number | null;
      const currency = row.currency as Currency | null;
      if (!cents || !currency || cents <= 0) continue;
      const bucket = byCurrency.get(currency) ?? [];
      bucket.push(cents);
      byCurrency.set(currency, bucket);
    }
    const suggestedAmounts: Partial<Record<Currency, number>> = {};
    for (const [currency, values] of byCurrency.entries()) {
      if (values.length < MIN_PRICING_SAMPLE_SIZE) continue;
      const median = medianCentsLowerMiddle(values);
      if (median !== null) suggestedAmounts[currency] = median;
    }

    return {
      success: true,
      data: { groups: result, suggested_amount_cents: suggestedAmounts },
    };
  } catch (error) {
    logError(error, { action: 'listUnpaidAttendance.exception' });
    return { success: false, error: 'Failed to load unpaid attendance' };
  }
}
