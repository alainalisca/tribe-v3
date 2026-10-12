'use client';

/**
 * T-PLAN1 part B: comp or un-comp a coach plan from the admin Users tab.
 *
 * Lives in the row's action menu. Posts to /api/admin/coach-plans, which checks
 * is_app_admin() and writes with the service role (records granted_by). A user
 * paying through Stripe cannot be comped (409): they cancel in the portal first.
 * Rendered only while COACH_PLANS_ENABLED is on.
 */

import { useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { getCoachPlan, type CompCoachPlan } from '@/lib/subscription/coachPlans';

interface CoachPlanControlProps {
  user: { id: string; coach_plan?: string | null; coach_plan_source?: string | null };
}

const PLAN_LABEL: Record<string, { en: string; es: string }> = {
  basico: { en: 'Basic', es: 'Básico' },
  pro: { en: 'Coach Pro', es: 'Coach Pro' },
  crecimiento: { en: 'Crecimiento', es: 'Crecimiento' },
  embajador: { en: 'Ambassador', es: 'Embajador' },
};

export default function CoachPlanControl({ user }: CoachPlanControlProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [plan, setPlan] = useState(getCoachPlan(user));
  const [source, setSource] = useState<string | null>(user.coach_plan_source ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { action: 'grant'; plan: CompCoachPlan } | { action: 'revoke' }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/coach-plans/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, ...body }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const code =
          typeof json === 'object' && json !== null && 'error' in json
            ? String((json as { error: unknown }).error)
            : '';
        setError(
          code === 'has_stripe_subscription'
            ? isEs
              ? 'Paga con Stripe: que cancele en el portal primero.'
              : 'Pays through Stripe: they must cancel in the portal first.'
            : isEs
              ? 'No se pudo guardar.'
              : 'Could not save.'
        );
        return;
      }
      if (body.action === 'grant') {
        setPlan(body.plan);
        setSource('comp');
      } else {
        setPlan('basico');
        setSource(null);
      }
    } catch {
      setError(isEs ? 'No se pudo guardar.' : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  const isComp = source === 'comp' && plan !== 'basico';
  const label = PLAN_LABEL[plan][isEs ? 'es' : 'en'] + (isComp ? (isEs ? ' (regalo)' : ' (comp)') : '');
  const btn =
    'px-3 py-1.5 text-xs font-semibold rounded-lg border border-tribe-dark/20 dark:border-white/20 disabled:opacity-50 transition';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-tribe-dark-80 dark:text-tribe-dark-60">
        {isEs ? 'Plan' : 'Plan'}: <strong>{label}</strong>
      </span>
      {isComp ? (
        <button type="button" disabled={busy} onClick={() => send({ action: 'revoke' })} className={btn}>
          {isEs ? 'Quitar plan' : 'Remove plan'}
        </button>
      ) : (
        (['embajador', 'pro', 'crecimiento'] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => send({ action: 'grant', plan: p })}
            className={btn}
          >
            {isEs ? 'Regalar' : 'Comp'} {PLAN_LABEL[p][isEs ? 'es' : 'en']}
          </button>
        ))
      )}
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
