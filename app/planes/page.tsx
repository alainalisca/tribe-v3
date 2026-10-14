/**
 * /planes   (T-PLAN1 part C)
 *
 * Public pricing page for coaches and gyms. While COACH_PLANS_ENABLED is off it
 * is a 404, exactly as before the page existed.
 *
 * Server component so the viewer's plan comes from the service role (only
 * coach_plan is client-readable; status, source and the Stripe customer are
 * not) and so the prices come from env, never from the bundle.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { fetchCoachPlanRow } from '@/lib/dal/coachPlans';
import {
  coachPlanDisplayAmount,
  coachPlansCurrency,
  coachPlansWhatsappDigits,
  hasProBenefits,
  isCoachPlansEnabled,
} from '@/lib/subscription/coachPlans';
import PlanesClient, { type PlanesViewer } from './PlanesClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planes para coaches | Tribe',
  description: 'Llena tus clases. Nosotros te ayudamos. Tu perfil y tus clases en Tribe siempre son gratis.',
  openGraph: {
    title: 'Llena tus clases. Nosotros te ayudamos.',
    description: 'Planes para coaches y gimnasios en Medellín. Tu perfil y tus clases en Tribe siempre son gratis.',
    type: 'website',
    locale: 'es_CO',
  },
  twitter: {
    card: 'summary',
    title: 'Llena tus clases. Nosotros te ayudamos.',
    description: 'Planes para coaches y gimnasios en Medellín.',
  },
};

async function loadViewer(): Promise<PlanesViewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false };

  const row = await fetchCoachPlanRow(getServiceRoleClient(), user.id);
  if (!row.success || !row.data)
    return { signedIn: true, isInstructor: false, plan: 'basico', active: false, canManage: false, comped: false };
  const r = row.data;
  const active = hasProBenefits(r);
  return {
    signedIn: true,
    isInstructor: r.is_instructor === true,
    plan: active ? r.coach_plan : 'basico',
    active,
    comped: active && r.coach_plan_source === 'comp',
    canManage: r.coach_plan_source !== 'comp' && Boolean(r.coach_plan_stripe_customer_id),
  };
}

export default async function PlanesPage() {
  if (!isCoachPlansEnabled()) notFound();

  const viewer = await loadViewer();
  const currency = coachPlansCurrency();
  return (
    <PlanesClient
      viewer={viewer}
      prices={{
        pro: coachPlanDisplayAmount('pro'),
        crecimiento: coachPlanDisplayAmount('crecimiento'),
        currency,
      }}
      whatsappDigits={coachPlansWhatsappDigits()}
    />
  );
}
