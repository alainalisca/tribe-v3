import 'server-only';

/**
 * T-SITE1 Part D. Whether the site shows the coach plan links (/planes).
 *
 * Read on the server from COACH_PLANS_ENABLED, the variable T-PLAN1 derives its
 * NEXT_PUBLIC_ copy from at build time, so both flip together. T-PLAN1's own
 * helper (lib/subscription/coachPlans.ts, isCoachPlansEnabled) is not on main
 * yet; when it lands, replace this with an import of it if it reads the server
 * variable, and delete this file.
 */
export function coachPlansEnabled(): boolean {
  return process.env.COACH_PLANS_ENABLED === 'true';
}
