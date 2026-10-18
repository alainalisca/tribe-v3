'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { normalizeGuestPhone } from '@/lib/guestPhone';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import br from '@/components/bridge/bridge.module.css';
import s from './signedOut.module.css';

/**
 * T-JOIN1 Part B: "Pedir mi cupo", the guest's two fields, in the bridge
 * style. Name and WhatsApp only (the email field is gone; the column stays and
 * is sent empty). The phone is checked here with the server's own rule
 * (lib/guestPhone.ts) so a typo is caught before anything is sent; the route
 * checks it again.
 */
export default function GuestJoinModal({
  hostName,
  joining,
  error,
  signInHref,
  onClose,
  onSubmit,
}: {
  /** The coach's first name, for "<Nombre> te confirma". */
  hostName: string;
  joining: boolean;
  /** A refusal from the server, already worded. */
  error: string | null;
  signInHref: string;
  onClose: () => void;
  onSubmit: (name: string, phone: string) => void;
}) {
  const t = useTranslations('sessionPublic');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    if (!name.trim()) return setProblem(t('nameMissing'));
    if (!normalizeGuestPhone(phone)) return setProblem(t('phoneInvalid'));
    setProblem(null);
    onSubmit(name.trim(), phone);
  }

  const shown = problem ?? error;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-modal="true" className={`${br.bridge} ${SITE_FONT_CLASS} ${s.modal}`}>
        <DialogHeader>
          <DialogTitle className={`${br.disp} ${s.modalTitle}`}>{t('modalTitle')}</DialogTitle>
          <DialogDescription className={s.modalSub}>{t('modalSub', { name: hostName })}</DialogDescription>
        </DialogHeader>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <label className={s.field}>
            <span className={`${br.mono} ${s.label}`}>{t('nameLabel')}</span>
            <input
              className={s.input}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </label>
          <label className={s.field}>
            <span className={`${br.mono} ${s.label}`}>{t('phoneLabel')}</span>
            <input
              className={s.input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="300 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-describedby="guest-phone-hint"
              aria-invalid={!!problem && problem === t('phoneInvalid')}
            />
            <span id="guest-phone-hint" className={s.hint}>
              {t('phoneHint')}
            </span>
          </label>
          {shown && (
            <p className={s.error} role="alert">
              {shown}
            </p>
          )}
          <button type="submit" className={s.limeButton} disabled={joining}>
            {joining ? t('confirming') : t('confirm')}
          </button>
        </form>
        <p className={s.modalFoot}>
          {t('haveAccount')}{' '}
          <a href={signInHref} className={s.footLink}>
            {t('signIn')}
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
