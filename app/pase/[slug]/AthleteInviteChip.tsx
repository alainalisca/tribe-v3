/**
 * T-AV23. "Te invita {firstName}" above the pass form, when the link carries a
 * Tribe athlete's code that resolves at this gym and the athletes flag is on
 * (lib/pase/athleteAttribution.ts decides both). First name only: that is all
 * the server lookup returns.
 *
 * Green as a FILL with dark text (CLAUDE.md: no green passes AA as small text
 * on light, and green-on-dark text is fine, but a fill reads the same on both).
 */
interface AthleteInviteChipProps {
  firstName: string;
}

export default function AthleteInviteChip({ firstName }: AthleteInviteChipProps) {
  return (
    <div className="mb-4 flex justify-center">
      <p className="rounded-full bg-tribe-green px-4 py-2 text-sm font-semibold text-tribe-dark">
        Te invita {firstName}
      </p>
    </div>
  );
}
