/** The selected / unselected look every choice chip on the session form shares. */
export function chipClass(selected: boolean): string {
  return selected
    ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
    : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green';
}

/** A field's inline error line. */
export const ERROR_TEXT = 'text-red-500 text-sm mt-1';
