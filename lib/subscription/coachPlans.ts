/**
 * T-PLAN1: paid plans for coaches and gyms (Stripe Billing).
 *
 * Pure rules and config. Safe to import from client components: nothing here
 * touches the database, and the server-only values (Stripe price ids) are read
 * lazily, so on the client they are simply undefined.
 *
 * The basic listing stays free forever. What a paid plan buys is visibility
 * (the badge, "Coaches destacados") and Al's done-for-you services. Nothing a
 * Basico coach can do today is gated by anything in this file.
 */

export const COACH_PLANS = ['basico', 'pro', 'crecimiento', 'embajador'] as const;
export type CoachPlan = (typeof COACH_PLANS)[number];

/** The plans sold through Stripe. Embajador is comp only and never sold. */
export const PAID_COACH_PLANS = ['pro', 'crecimiento'] as const;
export type PaidCoachPlan = (typeof PAID_COACH_PLANS)[number];

/** Plans an admin may comp. */
export const COMP_COACH_PLANS = ['embajador', 'pro', 'crecimiento'] as const;
export type CompCoachPlan = (typeof COMP_COACH_PLANS)[number];

export type CoachPlanStatus = 'active' | 'past_due' | 'canceled';
export type CoachPlanSource = 'stripe' | 'comp';

/** The server-side plan state (service-role read; none of it but coach_plan is client-readable). */
export interface CoachPlanState {
  coach_plan: CoachPlan;
  coach_plan_status: CoachPlanStatus | null;
  coach_plan_source: CoachPlanSource | null;
  coach_plan_current_period_end: string | null;
}

/** Past-due keeps benefits this long after the period ends, a backstop to Stripe's 7-day dunning. */
export const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single feature flag for everything a user can see. Off by default.
 *
 * NEXT_PUBLIC_COACH_PLANS_ENABLED is not set by hand: next.config.ts copies it
 * from COACH_PLANS_ENABLED at build time, so there is one variable to flip and
 * client and server always agree. Flipping it needs a redeploy.
 */
export function isCoachPlansEnabled(): boolean {
  return process.env.NEXT_PUBLIC_COACH_PLANS_ENABLED === 'true';
}

export function isCoachPlan(value: unknown): value is CoachPlan {
  return typeof value === 'string' && (COACH_PLANS as readonly string[]).includes(value);
}

export function isPaidCoachPlan(value: unknown): value is PaidCoachPlan {
  return typeof value === 'string' && (PAID_COACH_PLANS as readonly string[]).includes(value);
}

/** The plan off any row-ish object; anything unknown or missing reads as basico. */
export function getCoachPlan(user: { coach_plan?: string | null } | null | undefined): CoachPlan {
  const plan = user?.coach_plan;
  return isCoachPlan(plan) ? plan : 'basico';
}

/**
 * Does this coach get the paid benefits right now?
 *
 * - basico: never.
 * - a comp (embajador, or a comped pro/crecimiento): yes, until an admin removes it.
 * - Stripe active: yes.
 * - Stripe past_due: yes for PAST_DUE_GRACE_DAYS after the unpaid renewal, then no.
 *   Stripe's dunning cancels at 7 days and the webhook moves the coach back to
 *   basico; this is the backstop for a missed webhook.
 *
 *   The renewal is the START of the current period, not current_period_end:
 *   when a renewal charge fails Stripe has already advanced the period, so
 *   current_period_end is a month AHEAD. Measured in Stripe test mode on
 *   2026-10-12 (failed renewal: status past_due, period end +1 month). Plans are
 *   monthly, so the start is current_period_end minus one calendar month.
 * - canceled: no.
 */
export function hasProBenefits(state: CoachPlanState | null | undefined, now: Date = new Date()): boolean {
  if (!state) return false;
  const plan = getCoachPlan(state);
  if (plan === 'basico') return false;
  if (state.coach_plan_source === 'comp') return state.coach_plan_status !== 'canceled';
  if (state.coach_plan_status === 'active') return true;
  if (state.coach_plan_status === 'past_due') {
    if (!state.coach_plan_current_period_end) return false;
    const end = new Date(state.coach_plan_current_period_end);
    if (Number.isNaN(end.getTime())) return false;
    const renewal = new Date(end.getTime());
    renewal.setUTCMonth(renewal.getUTCMonth() - 1);
    return now.getTime() <= renewal.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS;
  }
  return false;
}

/**
 * The public badge, from the one client-readable column. Stripe's dunning keeps
 * coach_plan truthful (a failed renewal is canceled after 7 days and the
 * webhook writes basico), so the badge needs nothing else.
 */
export type CoachPlanBadgeKind = 'pro' | 'embajador';
export function coachPlanBadge(plan: string | null | undefined): CoachPlanBadgeKind | null {
  if (plan === 'pro' || plan === 'crecimiento') return 'pro';
  if (plan === 'embajador') return 'embajador';
  return null;
}

/** Plans whose coaches appear in "Coaches destacados". */
export const DESTACADOS_PLANS: readonly CoachPlan[] = ['pro', 'crecimiento', 'embajador'];

// ── Config read from env (server side) ──────────────────────────────────────

/** The Stripe Price id for a paid plan, or null when not configured. */
export function coachPlanPriceId(plan: PaidCoachPlan): string | null {
  const id = plan === 'pro' ? process.env.STRIPE_COACH_PRO_PRICE_ID : process.env.STRIPE_CRECIMIENTO_PRICE_ID;
  return id && id.trim() !== '' ? id.trim() : null;
}

/** Which paid plan a Stripe Price id is, or null when it is neither. */
export function coachPlanForPriceId(priceId: string | null | undefined): PaidCoachPlan | null {
  if (!priceId) return null;
  if (priceId === coachPlanPriceId('pro')) return 'pro';
  if (priceId === coachPlanPriceId('crecimiento')) return 'crecimiento';
  return null;
}

/** ISO currency the plans are shown in. The charge currency is the Stripe Price's own. */
export function coachPlansCurrency(): string {
  const c = process.env.COACH_PLANS_CURRENCY;
  return c && /^[A-Za-z]{3}$/.test(c.trim()) ? c.trim().toUpperCase() : 'COP';
}

/**
 * The monthly amount shown on /planes, in whole currency units (89000, not
 * 8900000). Must match the Stripe Price, which is what is actually charged.
 */
export function coachPlanDisplayAmount(plan: PaidCoachPlan): number | null {
  const raw = plan === 'pro' ? process.env.COACH_PLAN_PRO_AMOUNT : process.env.COACH_PLAN_CRECIMIENTO_AMOUNT;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "89.000 COP" (Colombian grouping, no decimals). */
export function formatCoachPlanPrice(amount: number, currency: string): string {
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount)} ${currency}`;
}

/** The WhatsApp number for "Hablar con Al", digits only, or null when unset. */
export function coachPlansWhatsappDigits(): string | null {
  const digits = (process.env.COACH_PLANS_WHATSAPP ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}
