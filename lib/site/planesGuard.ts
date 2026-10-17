/**
 * T-SITE1 Part D. COACH_PLANS_ENABLED cannot be turned on before T-PLAN1 merges.
 *
 * With the flag on, the site links to /planes from Inicio, Coaches, Gimnasios
 * and the footer. That page ships with T-PLAN1 (app/planes/page.tsx), so a build
 * with the flag on and no such page would publish dead links. next.config.ts
 * calls this at build time and the build fails instead (Al, 2026-10-17).
 *
 * No imports: next.config.ts loads it.
 */
export const PLANES_PAGE = 'app/planes/page.tsx';

export function planesGuardError(flag: string | undefined, planesPageExists: boolean): string | null {
  if (flag !== 'true' || planesPageExists) return null;
  return (
    `COACH_PLANS_ENABLED=true but ${PLANES_PAGE} does not exist. The site would link to a /planes ` +
    'page that is not there. Merge T-PLAN1 first, or leave the flag off.'
  );
}
