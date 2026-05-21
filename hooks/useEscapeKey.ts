/**
 * Close-on-Escape for hand-rolled modals.
 *
 * Radix-based dialogs (ui/dialog, ui/alert-dialog, ConfirmDialog) get
 * Escape + focus-trap for free. A few interactive modals are hand-
 * rolled overlay divs — this gives them the expected Escape behavior
 * without a full Radix refactor. Pass `active` so the listener is only
 * bound while the modal is open (and, typically, not mid-submit).
 */
import { useEffect } from 'react';

export function useEscapeKey(handler: () => void, active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handler();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, handler]);
}
