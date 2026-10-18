'use client';

import { useSyncExternalStore } from 'react';

/**
 * T-UI-SD1: whether any modal dialog or bottom sheet is open on the page, as
 * Radix marks them (role="dialog", data-state="open"). Floating chrome such as
 * the feedback bubble hides while one is up, so it never sits on top of a
 * sheet's content (the Gestionar sheet's Tribe.OS card, for one).
 */
export const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

export function anyDialogOpen(root: ParentNode = document): boolean {
  return root.querySelector(OPEN_DIALOG_SELECTOR) !== null;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-state'],
  });
  return () => observer.disconnect();
}

export function useAnyDialogOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => anyDialogOpen(),
    () => false
  );
}
