import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  coachPlanBadge,
  coachPlanDisplayAmount,
  coachPlanForPriceId,
  coachPlanPriceId,
  coachPlansCurrency,
  coachPlansWhatsappDigits,
  formatCoachPlanPrice,
  getCoachPlan,
  hasProBenefits,
  isCoachPlansEnabled,
  type CoachPlanState,
} from './coachPlans';

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

function state(over: Partial<CoachPlanState>): CoachPlanState {
  return {
    coach_plan: 'pro',
    coach_plan_status: 'active',
    coach_plan_source: 'stripe',
    coach_plan_current_period_end: iso(NOW.getTime() + 10 * DAY),
    ...over,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe('isCoachPlansEnabled', () => {
  it('is off unless the flag is exactly "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', '');
    expect(isCoachPlansEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'false');
    expect(isCoachPlansEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', '1');
    expect(isCoachPlansEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_COACH_PLANS_ENABLED', 'true');
    expect(isCoachPlansEnabled()).toBe(true);
  });
});

describe('getCoachPlan', () => {
  it('reads a known plan and treats anything else as basico', () => {
    expect(getCoachPlan({ coach_plan: 'crecimiento' })).toBe('crecimiento');
    expect(getCoachPlan({ coach_plan: 'platinum' })).toBe('basico');
    expect(getCoachPlan({ coach_plan: null })).toBe('basico');
    expect(getCoachPlan(null)).toBe('basico');
  });
});

describe('hasProBenefits', () => {
  it('never for basico, even with stale Stripe fields', () => {
    expect(hasProBenefits(state({ coach_plan: 'basico' }), NOW)).toBe(false);
  });

  it('for active pro and crecimiento', () => {
    expect(hasProBenefits(state({}), NOW)).toBe(true);
    expect(hasProBenefits(state({ coach_plan: 'crecimiento' }), NOW)).toBe(true);
  });

  it('for a comp, with no Stripe fields at all, until removed', () => {
    const comp = state({ coach_plan: 'embajador', coach_plan_source: 'comp', coach_plan_current_period_end: null });
    expect(hasProBenefits(comp, NOW)).toBe(true);
    expect(hasProBenefits({ ...comp, coach_plan_status: 'canceled' }, NOW)).toBe(false);
  });

  it('past_due keeps benefits for 7 days after the failed renewal, then stops', () => {
    // A failed renewal on 2026-10-20: Stripe has already moved the period end
    // to 2026-11-20, so the grace runs from 10-20, not from 11-20.
    const renewal = Date.parse('2026-10-20T12:00:00Z');
    const pastDue = state({ coach_plan_status: 'past_due', coach_plan_current_period_end: '2026-11-20T12:00:00.000Z' });
    expect(hasProBenefits(pastDue, new Date(renewal + 3 * DAY))).toBe(true);
    expect(hasProBenefits(pastDue, new Date(renewal + 7 * DAY))).toBe(true);
    expect(hasProBenefits(pastDue, new Date(renewal + 7 * DAY + 1))).toBe(false);
    // Not a month of free benefits measured from the advanced period end.
    expect(hasProBenefits(pastDue, new Date(Date.parse('2026-11-25T00:00:00Z')))).toBe(false);
  });

  it('past_due without a period end gets nothing (cannot compute the grace)', () => {
    expect(hasProBenefits(state({ coach_plan_status: 'past_due', coach_plan_current_period_end: null }), NOW)).toBe(
      false
    );
  });

  it('never when canceled, or with no state', () => {
    expect(hasProBenefits(state({ coach_plan_status: 'canceled' }), NOW)).toBe(false);
    expect(hasProBenefits(null, NOW)).toBe(false);
  });
});

describe('coachPlanBadge', () => {
  it('Pro for both paid plans, Embajador for ambassadors, nothing otherwise', () => {
    expect(coachPlanBadge('pro')).toBe('pro');
    expect(coachPlanBadge('crecimiento')).toBe('pro');
    expect(coachPlanBadge('embajador')).toBe('embajador');
    expect(coachPlanBadge('basico')).toBeNull();
    expect(coachPlanBadge(undefined)).toBeNull();
  });
});

describe('config from env', () => {
  it('maps price ids both ways and never hardcodes one', () => {
    expect(coachPlanPriceId('pro')).toBeNull();
    vi.stubEnv('STRIPE_COACH_PRO_PRICE_ID', 'price_pro');
    vi.stubEnv('STRIPE_CRECIMIENTO_PRICE_ID', 'price_crec');
    expect(coachPlanPriceId('pro')).toBe('price_pro');
    expect(coachPlanForPriceId('price_crec')).toBe('crecimiento');
    expect(coachPlanForPriceId('price_other')).toBeNull();
    expect(coachPlanForPriceId(null)).toBeNull();
  });

  it('currency defaults to COP and amounts must be positive numbers', () => {
    expect(coachPlansCurrency()).toBe('COP');
    vi.stubEnv('COACH_PLANS_CURRENCY', 'usd');
    expect(coachPlansCurrency()).toBe('USD');
    expect(coachPlanDisplayAmount('pro')).toBeNull();
    vi.stubEnv('COACH_PLAN_PRO_AMOUNT', '89000');
    expect(coachPlanDisplayAmount('pro')).toBe(89000);
    vi.stubEnv('COACH_PLAN_PRO_AMOUNT', 'abc');
    expect(coachPlanDisplayAmount('pro')).toBeNull();
  });

  it('formats prices the Colombian way', () => {
    expect(formatCoachPlanPrice(89000, 'COP')).toBe('89.000 COP');
    expect(formatCoachPlanPrice(490000, 'COP')).toBe('490.000 COP');
  });

  it('WhatsApp is digits only, or null when unset', () => {
    expect(coachPlansWhatsappDigits()).toBeNull();
    vi.stubEnv('COACH_PLANS_WHATSAPP', '+57 300 111 2233');
    expect(coachPlansWhatsappDigits()).toBe('573001112233');
  });
});
