export async function initBackButtonHandler() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    const { App } = await import('@capacitor/app');

    App.addListener('backButton', ({ canGoBack }) => {
      // Check for open modals/overlays first
      const modal = document.querySelector('[data-modal="true"]');
      if (modal) {
        const closeBtn = modal.querySelector('[data-modal-close="true"]');
        if (closeBtn instanceof HTMLElement) {
          closeBtn.click();
          return;
        }
      }

      // Check for open dialogs (ConfirmDialog)
      const dialog = document.querySelector('[data-confirm-dialog="true"]');
      if (dialog) {
        const cancelBtn = dialog.querySelector('[data-confirm-cancel="true"]');
        if (cancelBtn instanceof HTMLElement) {
          cancelBtn.click();
          return;
        }
      }

      // No modal open — go back or exit
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch {
    /* Capacitor not available */
  }
}
