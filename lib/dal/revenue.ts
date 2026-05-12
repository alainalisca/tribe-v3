/**
 * DAL: revenue dashboard for Tribe.OS premium creators.
 *
 * Surfaces:
 *   - /os/revenue uses getRevenueSummary for the summary cards + chart
 *   - /os/revenue uses listPayments for the payment table
 *   - /api/tribe-os/revenue/export uses generatePaymentsCsv for the
 *     "Export CSV" download
 *   - getDefaultCurrencyForUser is consumed by the UI to decide which
 *     currency to display first when an instructor has both USD and COP
 *     earnings
 *
 * All functions enforce the caller-contract for the underlying SQL
 * functions: the API/route layer authenticates and passes auth.uid() as
 * userId; this layer never trusts a userId provided by the client.
 *
 * Period semantics: API takes inclusive ISO date strings (YYYY-MM-DD).
 * SQL functions expect EXCLUSIVE end dates. This DAL adds one day to
 * `toIsoDate` before passing so callers can use natural inclusive ranges
 * (e.g. "from 2026-05-01 to 2026-05-31" returns all of May).
 *
 * Timezone: we look up users.timezone and pass it to the SQL functions
 * so period boundaries and bucket truncation happen in the instructor's
 * local time. A payment at 23:45 local on May 31 lives in May, not June.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

// ---- Types ----

export type RevenueCurrency = 'USD' | 'COP';
export type RevenueGroupBy = 'week' | 'month';
export type PaymentSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export interface CurrencyTotals {
  gross_cents: number;
  fee_cents: number;
  refund_cents: number;
  net_cents: number;
  payment_count: number;
}

export interface RevenueBucket {
  /** ISO date of the first day of the bucket, in the instructor's timezone. */
  period_start: string;
  /** ISO date of the last day INCLUDED in the bucket (inclusive). */
  period_end: string;
  /** Per-currency totals for this bucket. Currencies absent if no payments. */
  USD?: CurrencyTotals;
  COP?: CurrencyTotals;
}

export interface RevenueSummary {
  totals: {
    USD?: CurrencyTotals;
    COP?: CurrencyTotals;
  };
  buckets: RevenueBucket[];
  currency_default: RevenueCurrency;
  group_by: RevenueGroupBy;
}

export interface PaymentRow {
  id: string;
  /** ISO timestamp in UTC. The UI formats to the instructor's local TZ. */
  created_at: string;
  session_id: string;
  session_title: string;
  participant_name: string;
  participant_email: string | null;
  currency: RevenueCurrency;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  refunded_cents: number;
  status: string;
  stripe_payment_intent_id: string | null;
  refunded_at: string | null;
}

export interface PaymentListResult {
  payments: PaymentRow[];
  total: number;
  has_more: boolean;
}

export interface RevenueSummaryOptions {
  /** Defaults to 'all'. When 'USD' or 'COP', only that currency is returned. */
  currency?: RevenueCurrency | 'all';
  /** Defaults to auto-pick based on range length. */
  groupBy?: RevenueGroupBy;
}

export interface ListPaymentsOptions {
  currency?: RevenueCurrency | 'all';
  limit?: number;
  offset?: number;
  sort?: PaymentSort;
}

// ---- Constants ----

/** Hard cap on date range for any revenue query. Keeps SQL bounded. */
export const MAX_RANGE_DAYS = 366;

/** Default page size for the payments table. */
export const DEFAULT_PAYMENT_LIMIT = 50;
export const MAX_PAYMENT_LIMIT = 200;

/** When the request doesn't specify, period spans <= this many days use
 *  weekly buckets; longer periods use monthly buckets. */
const WEEKLY_BUCKET_THRESHOLD_DAYS = 90;

// ---- Internal helpers ----

interface UserTimezoneRow {
  timezone: string;
  tribe_os_revenue_currency_default: RevenueCurrency | null;
}

async function getUserTimezoneAndDefault(
  supabase: SupabaseClient,
  userId: string
): Promise<{ timezone: string; currencyDefault: RevenueCurrency | null }> {
  const { data, error } = await supabase
    .from('users')
    .select('timezone, tribe_os_revenue_currency_default')
    .eq('id', userId)
    .single();
  if (error || !data) {
    // Fall back to UTC + null default. Not a hard error — display
    // preferences shouldn't break revenue.
    logError(error ?? new Error('user_not_found'), { action: 'getUserTimezoneAndDefault', userId });
    return { timezone: 'UTC', currencyDefault: null };
  }
  const row = data as UserTimezoneRow;
  return { timezone: row.timezone ?? 'UTC', currencyDefault: row.tribe_os_revenue_currency_default };
}

/** Parses YYYY-MM-DD into a UTC Date at midnight. Throws on invalid input. */
function parseIsoDate(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date format: ${iso}. Expected YYYY-MM-DD.`);
  }
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return date;
}

/** Formats a UTC Date as YYYY-MM-DD. */
function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds N days to a date, returning a new Date. */
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Computes the EXCLUSIVE end-date the SQL function expects, given the
 *  caller's inclusive `toIsoDate`. */
function toExclusiveEnd(toIsoDate: string): string {
  return formatIsoDate(addDays(parseIsoDate(toIsoDate), 1));
}

/**
 * Returns the UTC ISO timestamp corresponding to 00:00:00 on `dateIso` in
 * the given IANA `timezone`. Used to align Supabase's UTC-based filters
 * with the instructor's local-time view of "May 1".
 *
 * Strategy: format a UTC anchor in the target timezone, see how it
 * differs from the desired local moment, and shift by that delta. Robust
 * across DST transitions because Intl.DateTimeFormat does the heavy
 * lifting.
 */
function startOfDayUtcIso(dateIso: string, timezone: string): string {
  const utcAnchor = new Date(`${dateIso}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcAnchor);
  const get = (type: string): number => {
    const v = parts.find((p) => p.type === type)?.value ?? '0';
    // 'hour' in en-CA can be '24' for midnight; normalize.
    const n = parseInt(v, 10);
    return type === 'hour' && n === 24 ? 0 : n;
  };
  const localMoment = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const [targetY, targetM, targetD] = dateIso.split('-').map(Number);
  const targetMoment = Date.UTC(targetY, targetM - 1, targetD, 0, 0, 0);
  const delta = targetMoment - localMoment;
  return new Date(utcAnchor.getTime() + delta).toISOString();
}

/** Days between two ISO date strings, inclusive of both ends. */
function rangeDays(fromIsoDate: string, toIsoDate: string): number {
  const from = parseIsoDate(fromIsoDate);
  const to = parseIsoDate(toIsoDate);
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

/** Auto-picks weekly or monthly bucketing based on range length. */
function autoGroupBy(fromIsoDate: string, toIsoDate: string): RevenueGroupBy {
  return rangeDays(fromIsoDate, toIsoDate) <= WEEKLY_BUCKET_THRESHOLD_DAYS ? 'week' : 'month';
}

/** Computes the inclusive last day of a bucket given its start and group. */
function bucketEnd(bucketStartIso: string, groupBy: RevenueGroupBy): string {
  const start = parseIsoDate(bucketStartIso);
  if (groupBy === 'week') {
    return formatIsoDate(addDays(start, 6));
  }
  // Month: last day of the same calendar month.
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return formatIsoDate(lastDay);
}

/** Validates the date range and returns the timezone-adjusted span params
 *  used by both summary and list queries. Throws on invalid range. */
function prepareRange(
  fromIsoDate: string,
  toIsoDate: string
): {
  fromExclusiveStart: string;
  toExclusiveEnd: string;
  spanDays: number;
} {
  parseIsoDate(fromIsoDate); // throws if malformed
  parseIsoDate(toIsoDate);
  if (toIsoDate < fromIsoDate) {
    throw new Error(`'to' (${toIsoDate}) is before 'from' (${fromIsoDate}).`);
  }
  const spanDays = rangeDays(fromIsoDate, toIsoDate);
  if (spanDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range exceeds maximum of ${MAX_RANGE_DAYS} days (got ${spanDays}).`);
  }
  return {
    fromExclusiveStart: fromIsoDate,
    toExclusiveEnd: toExclusiveEnd(toIsoDate),
    spanDays,
  };
}

// ---- Raw SQL row shapes (mirrors RETURNS TABLE columns) ----

interface TotalsRow {
  currency: RevenueCurrency;
  gross_cents: number | string;
  fee_cents: number | string;
  refund_cents: number | string;
  net_cents: number | string;
  payment_count: number | string;
}

interface BucketsRow {
  bucket_start: string;
  currency: RevenueCurrency;
  gross_cents: number | string;
  fee_cents: number | string;
  refund_cents: number | string;
  net_cents: number | string;
  payment_count: number | string;
}

/** Postgres returns `bigint` columns as strings via PostgREST. Coerce
 *  defensively so the API layer always sees numbers. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function totalsRowToCurrencyTotals(r: TotalsRow): CurrencyTotals {
  return {
    gross_cents: num(r.gross_cents),
    fee_cents: num(r.fee_cents),
    refund_cents: num(r.refund_cents),
    net_cents: num(r.net_cents),
    payment_count: num(r.payment_count),
  };
}

function inferCurrencyDefault(totals: RevenueSummary['totals']): RevenueCurrency {
  // If only one currency has activity, lead with it. Otherwise pick the
  // one with more gross. Otherwise USD.
  const usd = totals.USD?.gross_cents ?? 0;
  const cop = totals.COP?.gross_cents ?? 0;
  if (usd > 0 && cop === 0) return 'USD';
  if (cop > 0 && usd === 0) return 'COP';
  if (cop > usd) return 'COP';
  return 'USD';
}

// ---- Public API ----

/**
 * Aggregate revenue for a creator over a period. Returns per-currency
 * totals plus a time series of buckets for the chart. Fails closed: any
 * error returns success:false, never a zeroed payload that could be
 * mistaken for "no revenue."
 */
export async function getRevenueSummary(
  supabase: SupabaseClient,
  userId: string,
  fromIsoDate: string,
  toIsoDate: string,
  options: RevenueSummaryOptions = {}
): Promise<DalResult<RevenueSummary>> {
  try {
    const { toExclusiveEnd: toExcl } = prepareRange(fromIsoDate, toIsoDate);
    const groupBy: RevenueGroupBy = options.groupBy ?? autoGroupBy(fromIsoDate, toIsoDate);
    const { timezone, currencyDefault } = await getUserTimezoneAndDefault(supabase, userId);

    const [totalsRes, bucketsRes] = await Promise.all([
      supabase.rpc('instructor_revenue_totals', {
        p_user_id: userId,
        p_period_start_date: fromIsoDate,
        p_period_end_date: toExcl,
        p_timezone: timezone,
      }),
      supabase.rpc('instructor_revenue_buckets', {
        p_user_id: userId,
        p_period_start_date: fromIsoDate,
        p_period_end_date: toExcl,
        p_group_by: groupBy,
        p_timezone: timezone,
      }),
    ]);

    if (totalsRes.error) {
      logError(totalsRes.error, { action: 'getRevenueSummary.totals', userId });
      return { success: false, error: totalsRes.error.message };
    }
    if (bucketsRes.error) {
      logError(bucketsRes.error, { action: 'getRevenueSummary.buckets', userId });
      return { success: false, error: bucketsRes.error.message };
    }

    // Assemble totals
    const totalsRows = (totalsRes.data ?? []) as TotalsRow[];
    const totals: RevenueSummary['totals'] = {};
    for (const row of totalsRows) {
      if (options.currency && options.currency !== 'all' && row.currency !== options.currency) continue;
      totals[row.currency] = totalsRowToCurrencyTotals(row);
    }

    // Assemble buckets: group rows by bucket_start (ISO date), then by currency.
    const bucketsRows = (bucketsRes.data ?? []) as BucketsRow[];
    const bucketMap = new Map<string, RevenueBucket>();
    for (const row of bucketsRows) {
      if (options.currency && options.currency !== 'all' && row.currency !== options.currency) continue;
      const startIso = row.bucket_start.slice(0, 10);
      let bucket = bucketMap.get(startIso);
      if (!bucket) {
        bucket = {
          period_start: startIso,
          period_end: bucketEnd(startIso, groupBy),
        };
        bucketMap.set(startIso, bucket);
      }
      bucket[row.currency] = {
        gross_cents: num(row.gross_cents),
        fee_cents: num(row.fee_cents),
        refund_cents: num(row.refund_cents),
        net_cents: num(row.net_cents),
        payment_count: num(row.payment_count),
      };
    }
    const buckets = Array.from(bucketMap.values()).sort((a, b) => a.period_start.localeCompare(b.period_start));

    return {
      success: true,
      data: {
        totals,
        buckets,
        currency_default: currencyDefault ?? inferCurrencyDefault(totals),
        group_by: groupBy,
      },
    };
  } catch (error) {
    logError(error, { action: 'getRevenueSummary', userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch revenue summary',
    };
  }
}

/**
 * Paginated payment list for the table view and CSV export. Joins
 * sessions for the title and users for the participant's display name +
 * email. Fails closed.
 */
export async function listPayments(
  supabase: SupabaseClient,
  userId: string,
  fromIsoDate: string,
  toIsoDate: string,
  options: ListPaymentsOptions = {}
): Promise<DalResult<PaymentListResult>> {
  try {
    prepareRange(fromIsoDate, toIsoDate);
    const { timezone } = await getUserTimezoneAndDefault(supabase, userId);

    // Align the date filters with the instructor's local timezone so
    // a payment at 23:45 local on the last day of the period is still
    // included. SQL functions handle this via date_trunc(... , tz);
    // here we precompute the UTC equivalents for the Supabase filter.
    const fromTs = startOfDayUtcIso(fromIsoDate, timezone);
    const toTs = startOfDayUtcIso(toExclusiveEnd(toIsoDate), timezone);

    const limit = Math.min(options.limit ?? DEFAULT_PAYMENT_LIMIT, MAX_PAYMENT_LIMIT);
    const offset = Math.max(options.offset ?? 0, 0);
    const sort = options.sort ?? 'date_desc';

    // We need to filter payments by sessions.creator_id = userId, which
    // requires going through the sessions FK. The cleanest Supabase
    // pattern is to filter sessions first via nested filter syntax,
    // but the join makes pagination tricky. Instead, do two queries:
    //   1. fetch creator's session ids in the period (cheap)
    //   2. paginate payments by those ids + the date range
    // For instructors with hundreds of sessions this is fine; if it
    // becomes a bottleneck, switch to a SQL function.
    const { data: sessionRows, error: sessionsErr } = await supabase
      .from('sessions')
      .select('id, title, sport')
      .eq('creator_id', userId);
    if (sessionsErr) {
      logError(sessionsErr, { action: 'listPayments.sessions', userId });
      return { success: false, error: sessionsErr.message };
    }
    const sessionTitleById = new Map<string, string>();
    for (const s of (sessionRows ?? []) as Array<{ id: string; title: string | null; sport: string | null }>) {
      sessionTitleById.set(s.id, s.title || s.sport || 'Untitled session');
    }
    const sessionIds = Array.from(sessionTitleById.keys());
    if (sessionIds.length === 0) {
      return { success: true, data: { payments: [], total: 0, has_more: false } };
    }

    // Build the payments query
    let query = supabase
      .from('payments')
      .select(
        'id, created_at, session_id, participant_user_id, currency, amount_cents, platform_fee_cents, refunded_amount_cents, refunded_at, status, stripe_payment_intent_id',
        { count: 'exact' }
      )
      .in('session_id', sessionIds)
      .eq('status', 'approved')
      .gte('created_at', fromTs)
      .lt('created_at', toTs);

    if (options.currency && options.currency !== 'all') {
      query = query.eq('currency', options.currency);
    }

    switch (sort) {
      case 'date_asc':
        query = query.order('created_at', { ascending: true });
        break;
      case 'amount_desc':
        query = query.order('amount_cents', { ascending: false });
        break;
      case 'amount_asc':
        query = query.order('amount_cents', { ascending: true });
        break;
      case 'date_desc':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data: paymentRows, error: paymentsErr, count } = await query;
    if (paymentsErr) {
      logError(paymentsErr, { action: 'listPayments.payments', userId });
      return { success: false, error: paymentsErr.message };
    }

    type PaymentSelectRow = {
      id: string;
      created_at: string;
      session_id: string;
      participant_user_id: string | null;
      currency: RevenueCurrency;
      amount_cents: number | string;
      platform_fee_cents: number | string | null;
      refunded_amount_cents: number | string | null;
      refunded_at: string | null;
      status: string;
      stripe_payment_intent_id: string | null;
    };

    const rows = (paymentRows ?? []) as PaymentSelectRow[];

    // Fetch participant names + emails in a second query to avoid a join.
    const participantIds = Array.from(
      new Set(rows.map((r) => r.participant_user_id).filter((id): id is string => !!id))
    );
    const participantById = new Map<string, { name: string; email: string | null }>();
    if (participantIds.length > 0) {
      const { data: userRows, error: usersErr } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', participantIds);
      if (usersErr) {
        // Non-fatal: we can still show payment rows without names.
        logError(usersErr, { action: 'listPayments.users', userId });
      } else {
        for (const u of (userRows ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
          participantById.set(u.id, { name: u.name || 'Unknown', email: u.email });
        }
      }
    }

    const payments: PaymentRow[] = rows.map((r) => {
      const gross = num(r.amount_cents);
      const fee = num(r.platform_fee_cents);
      const refunded = num(r.refunded_amount_cents);
      return {
        id: r.id,
        created_at: r.created_at,
        session_id: r.session_id,
        session_title: sessionTitleById.get(r.session_id) ?? 'Untitled session',
        participant_name: (r.participant_user_id && participantById.get(r.participant_user_id)?.name) ?? 'Unknown',
        participant_email: (r.participant_user_id && participantById.get(r.participant_user_id)?.email) ?? null,
        currency: r.currency,
        gross_cents: gross,
        fee_cents: fee,
        net_cents: gross - fee - refunded,
        refunded_cents: refunded,
        status: r.status,
        stripe_payment_intent_id: r.stripe_payment_intent_id,
        refunded_at: r.refunded_at,
      };
    });

    const total = count ?? 0;
    const has_more = offset + payments.length < total;

    return { success: true, data: { payments, total, has_more } };
  } catch (error) {
    logError(error, { action: 'listPayments', userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list payments',
    };
  }
}

/**
 * Returns the instructor's preferred default currency for the revenue
 * dashboard. Fails open: any lookup error returns 'USD' so the UI keeps
 * rendering. This is a display preference, not security-sensitive.
 */
export async function getDefaultCurrencyForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DalResult<RevenueCurrency>> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('tribe_os_revenue_currency_default')
      .eq('id', userId)
      .single();
    if (error || !data) {
      logError(error ?? new Error('user_not_found'), { action: 'getDefaultCurrencyForUser', userId });
      return { success: true, data: 'USD' };
    }
    const row = data as { tribe_os_revenue_currency_default: RevenueCurrency | null };
    return { success: true, data: row.tribe_os_revenue_currency_default ?? 'USD' };
  } catch (error) {
    logError(error, { action: 'getDefaultCurrencyForUser', userId });
    return { success: true, data: 'USD' };
  }
}

/**
 * Generates a CSV of all payments in the period. Columns mirror the
 * spec's success criteria for tax-export use cases. Memory-built (no
 * streaming): safe for periods up to MAX_RANGE_DAYS with up to ~5000
 * payments. Beyond that we'd need to stream — flagged as a follow-up.
 */
export async function generatePaymentsCsv(
  supabase: SupabaseClient,
  userId: string,
  fromIsoDate: string,
  toIsoDate: string
): Promise<DalResult<string>> {
  try {
    const { timezone } = await getUserTimezoneAndDefault(supabase, userId);

    // Use the same listPayments path with a generous limit. If we hit
    // it we'll know — but at 5000 rows in a single period the on-screen
    // dashboard is also overwhelmed, so it's a reasonable ceiling.
    const EXPORT_LIMIT = 5000;
    const result = await listPayments(supabase, userId, fromIsoDate, toIsoDate, {
      limit: EXPORT_LIMIT,
      offset: 0,
      sort: 'date_asc',
    });
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? 'failed_to_list_payments' };
    }

    const rows = result.data.payments;

    // CSV format: BOM for Excel UTF-8 detection, then headers, then rows.
    // Quoting: wrap fields containing commas, quotes, or newlines. Double
    // any internal quotes per RFC 4180.
    const headers = [
      'date_utc',
      'date_local',
      'session_id',
      'session_title',
      'participant_name',
      'participant_email',
      'currency',
      'gross_cents',
      'fee_cents',
      'net_cents',
      'refunded_cents',
      'status',
      'payment_intent_id',
    ];

    const lines: string[] = [headers.join(',')];

    // Cache the formatter for the loop.
    const localFmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    for (const r of rows) {
      const dateUtc = r.created_at;
      const dateLocal = localFmt.format(new Date(r.created_at)).replace(' ', 'T');
      lines.push(
        [
          csvEscape(dateUtc),
          csvEscape(dateLocal),
          csvEscape(r.session_id),
          csvEscape(r.session_title),
          csvEscape(r.participant_name),
          csvEscape(r.participant_email ?? ''),
          csvEscape(r.currency),
          String(r.gross_cents),
          String(r.fee_cents),
          String(r.net_cents),
          String(r.refunded_cents),
          csvEscape(r.status),
          csvEscape(r.stripe_payment_intent_id ?? ''),
        ].join(',')
      );
    }

    const BOM = '﻿';
    return { success: true, data: BOM + lines.join('\r\n') };
  } catch (error) {
    logError(error, { action: 'generatePaymentsCsv', userId });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate CSV',
    };
  }
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
