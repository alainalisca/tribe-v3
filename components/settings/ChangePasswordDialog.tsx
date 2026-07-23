'use client';

/**
 * Change-password dialog for signed-in users.
 *
 * Provider-aware: only accounts backed by the 'email' provider have a password
 * Tribe can change. Apple/Google users see the trigger row DISABLED with an
 * explanation naming their provider, rather than the row being hidden. A missing
 * row reads as a bug; an explained one reads as an answer.
 *
 * The security flow lives in lib/auth/passwordChange.ts, not here, so it can be
 * tested without rendering.
 */

import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { getPasswordProvider, type PasswordChangeError } from '@/lib/auth/passwordChange';

interface ChangePasswordDialogProps {
  /** From user.app_metadata.provider — decides form vs. disabled explanation. */
  provider: string | undefined;
  /**
   * Performs the change. Returns null on success, or the error key to display.
   * Injected so the dialog stays presentational and the security flow is tested
   * separately.
   */
  onSubmit: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<PasswordChangeError | null>;
}

export default function ChangePasswordDialog({ provider, onSubmit }: ChangePasswordDialogProps) {
  const t = useTranslations('settings.account');
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<PasswordChangeError | null>(null);
  const [saving, setSaving] = useState(false);

  const kind = getPasswordProvider(provider);
  const isEmailAccount = kind === 'email';

  const oauthExplanation =
    kind === 'apple' ? t('oauthApple') : kind === 'google' ? t('oauthGoogle') : t('oauthGeneric');

  const errorText: Record<PasswordChangeError, string> = {
    current_wrong: t('errorCurrentWrong'),
    mismatch: t('errorMismatch'),
    too_short: t('errorTooShort'),
    same_as_current: t('errorSameAsCurrent'),
    no_email: t('errorGeneric'),
    generic: t('errorGeneric'),
  };

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSaving(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await onSubmit(currentPassword, newPassword, confirmPassword);
    if (result) {
      setError(result);
      setSaving(false);
      return;
    }
    close();
  }

  // OAuth accounts: disabled row plus the reason, no dialog.
  if (!isEmailAccount) {
    return (
      <div className="mt-3">
        <Button
          variant="ghost"
          disabled
          aria-disabled="true"
          className="w-full flex items-center justify-center gap-2 py-3 bg-stone-200 dark:bg-tribe-surface text-theme-secondary font-semibold rounded-xl opacity-60"
        >
          <KeyRound className="w-5 h-5" />
          {t('changePassword')}
        </Button>
        <p className="mt-2 text-xs text-theme-tertiary text-center">{oauthExplanation}</p>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-3 mt-3 bg-stone-200 dark:bg-tribe-surface text-theme-primary font-semibold rounded-xl hover:bg-stone-300 dark:hover:bg-tribe-mid"
      >
        <KeyRound className="w-5 h-5" />
        {t('changePassword')}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent data-modal="true" className="max-w-sm rounded-xl p-6 dark:bg-tribe-surface">
          <DialogTitle className="text-lg font-bold text-theme-primary">{t('changePassword')}</DialogTitle>
          <DialogDescription className="text-sm text-theme-secondary">{t('changePasswordSubtitle')}</DialogDescription>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="current-password" className="text-theme-secondary mb-1.5 block">
                {t('currentPassword')}
              </Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="dark:bg-tribe-mid dark:border-tribe-mid dark:text-white"
              />
            </div>

            <div>
              <Label htmlFor="new-password" className="text-theme-secondary mb-1.5 block">
                {t('newPassword')}
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="dark:bg-tribe-mid dark:border-tribe-mid dark:text-white"
              />
            </div>

            <div>
              <Label htmlFor="confirm-password" className="text-theme-secondary mb-1.5 block">
                {t('confirmPassword')}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="dark:bg-tribe-mid dark:border-tribe-mid dark:text-white"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errorText[error]}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={close}
                disabled={saving}
                className="flex-1 py-2.5 border border-stone-300 dark:border-tribe-mid rounded-lg text-theme-secondary hover:bg-stone-100 dark:hover:bg-tribe-mid font-medium disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={saving || !currentPassword || !newPassword || !confirmPassword}
                className="flex-1 py-2.5 bg-tribe-green text-slate-900 rounded-lg font-bold hover:bg-lime-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
