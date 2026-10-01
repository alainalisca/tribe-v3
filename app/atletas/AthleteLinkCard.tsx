'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { isRenderedQrSvg } from '@/lib/svg/qrSvgShape';
import { whatsappShareUrl, type AthleteMemberView } from '@/lib/atletas/athleteHomeView';

/**
 * "Mi link": the athlete's invite link, copy, share to WhatsApp, and the QR
 * rendered on the server (D9). Paused, ended or program off: one line instead
 * (decision 1, 2026-09-30), because T-AV23 attributes nothing for those codes
 * and a live-looking link would invite guests who will not count.
 */

export function WhatsAppShareButton({ view, className }: { view: AthleteMemberView; className?: string }) {
  const t = useTranslations('athleteHome');
  if (!view.link) return null;
  return (
    <a
      href={whatsappShareUrl(t('shareMessage', { gym: view.partnerName, link: view.link }))}
      target="_blank"
      rel="noopener noreferrer"
      data-share="whatsapp"
      className={`block rounded-xl bg-tribe-green px-5 py-3 text-center text-base font-semibold text-tribe-dark ${className ?? ''}`}
    >
      {t('linkShare')}
    </a>
  );
}

export default function AthleteLinkCard({ view }: { view: AthleteMemberView }) {
  const t = useTranslations('athleteHome');

  if (!view.linkActive || !view.link) {
    return (
      <section data-link-state="inactive" className="rounded-2xl bg-theme-card p-5">
        <h2 className="text-lg font-bold text-theme-primary">{t('linkTitle')}</h2>
        <p className="mt-2 text-sm text-theme-secondary">{t('linkInactive')}</p>
      </section>
    );
  }

  const link = view.link;
  const copied = t('linkCopied');
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      showSuccess(copied);
    } catch (error: unknown) {
      // The link is also in the field above, selected on tap, so a blocked
      // clipboard costs a long-press, not the link.
      logError(error, { action: 'athlete_link_copy' });
    }
  }

  return (
    <section data-link-state="active" className="rounded-2xl bg-theme-card p-5">
      <h2 className="text-lg font-bold text-theme-primary">{t('linkTitle')}</h2>
      <p className="mt-1 text-sm text-theme-secondary">{t('linkHelp')}</p>
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={t('linkTitle')}
        data-athlete-link={link}
        className="mt-3 w-full min-w-0 rounded-lg bg-theme-inset px-3 py-2 text-base text-theme-primary"
      />
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={copy}
          className="rounded-xl border-2 border-tribe-dark px-5 py-3 text-base font-semibold text-theme-primary dark:border-white"
        >
          {t('linkCopy')}
        </button>
        <WhatsAppShareButton view={view} />
      </div>
      {view.qrSvg && isRenderedQrSvg(view.qrSvg) ? (
        <div className="mt-4 flex flex-col items-center">
          <div
            data-link-qr
            className="h-44 w-44 rounded-lg bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
            // Safe: rendered on the server by renderQrSvg and shape-checked here.
            dangerouslySetInnerHTML={{ __html: view.qrSvg }}
          />
          <p className="mt-2 text-center text-sm text-theme-secondary">{t('qrCaption')}</p>
        </div>
      ) : null}
    </section>
  );
}
