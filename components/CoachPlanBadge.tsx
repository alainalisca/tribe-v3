'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { coachPlanBadge, isCoachPlansEnabled, type CoachPlanBadgeKind } from '@/lib/subscription/coachPlans';

interface CoachPlanBadgeProps {
  /** users.coach_plan (or sessions_public.creator_coach_plan). */
  plan: string | null | undefined;
  className?: string;
}

/**
 * T-PLAN1: the small "Pro" (Coach Pro, Tribe Crecimiento) or "Embajador" chip
 * next to an instructor's name. Renders nothing for Basico, for an unknown
 * value, or while COACH_PLANS_ENABLED is off, so it is safe to drop into any
 * name row.
 */
export default function CoachPlanBadge({ plan, className = '' }: CoachPlanBadgeProps) {
  // Decided before any hook runs: with the flag off (or no badge) nothing
  // renders and nothing is read, so every surface behaves exactly as before.
  if (!isCoachPlansEnabled()) return null;
  const kind = coachPlanBadge(plan);
  if (!kind) return null;
  return <CoachPlanChip kind={kind} className={className} />;
}

function CoachPlanChip({ kind, className }: { kind: CoachPlanBadgeKind; className: string }) {
  const { language } = useLanguage();

  const label = kind === 'pro' ? 'Pro' : language === 'es' ? 'Embajador' : 'Ambassador';
  const title =
    kind === 'pro'
      ? language === 'es'
        ? 'Coach Pro en Tribe'
        : 'Coach Pro on Tribe'
      : language === 'es'
        ? 'Embajador Tribe'
        : 'Tribe Ambassador';
  const tone =
    kind === 'pro' ? 'bg-tribe-green text-slate-900' : 'bg-slate-900 text-tribe-green border border-tribe-green';

  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none uppercase tracking-wide flex-shrink-0 ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
