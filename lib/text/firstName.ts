/**
 * T-UI-SD1: a person's first name as they wrote it ("Salomon Tabares Adarve"
 * -> "Salomon"), or '' when there is none. Pure, so client components can use
 * it (lib/og/coachCard's coachFirstName drags the card renderer along).
 */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
