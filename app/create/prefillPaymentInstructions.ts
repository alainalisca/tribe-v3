/**
 * T-PAY2: the value the instructions field should hold after the prefill read
 * lands. Anything the instructor already typed (non-blank) always wins.
 */
export function prefillPaymentInstructions(current: string, previous: string | null): string {
  if (current.trim()) return current;
  return previous?.trim() ? previous : current;
}
