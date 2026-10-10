'use client';

/**
 * "Trae a un amigo" (T-GROW2 B). One card for the three share moments: the
 * pass confirmation, a joined session, and the athlete's own profile.
 *
 * Primary action is WhatsApp (`wa.me/?text=`, no number, so WhatsApp opens its
 * own picker with the message prefilled). "Copiar enlace" copies the LINK, not
 * the message, because a link is what people paste into an Instagram DM. Where
 * the device supports it, a third button opens the native share sheet. Every
 * button logs a share_click.
 *
 * NO REWARD IS MENTIONED, and no body copy beyond the button labels: the reward
 * is unconfirmed (Al with Leo), and the messages themselves live in
 * lib/referral/shareLinks.ts with their approval status written down.
 *
 * No green text on a light surface (CLAUDE.md contrast table): the primary
 * button is tribe-dark with white text, as on the pass page.
 */
import { useEffect, useState } from 'react';
import { MessageCircle, Link2, Share2 } from 'lucide-react';
import { referralLink, referralMessage, whatsappShareUrl, type ReferralContext } from '@/lib/referral/shareLinks';
import { logShareClick, type ShareChannel } from '@/lib/referral/shareClick';
import { logError } from '@/lib/logger';

export interface BringAFriendCardProps {
  context: ReferralContext;
  /** The sharer's code: a lead's lead_ref_code or a user's TRIBE-XXXXX. */
  code: string;
  language: 'en' | 'es';
}

const LABELS = {
  es: { title: 'Trae a un amigo', whatsapp: 'Compartir por WhatsApp', copy: 'Copiar enlace', copied: 'Enlace copiado', more: 'Compartir' },
  en: { title: 'Bring a friend', whatsapp: 'Share on WhatsApp', copy: 'Copy link', copied: 'Link copied', more: 'Share' },
} as const;

export default function BringAFriendCard({ context, code, language }: BringAFriendCardProps) {
  const t = LABELS[language];
  const link = referralLink(context, code);
  const message = referralMessage(context, link, language);
  const [copied, setCopied] = useState(false);
  // Decided after mount: navigator does not exist during the server render, and
  // reading it in render would make the two passes disagree.
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const log = (channel: ShareChannel) => logShareClick(code, channel, window.location.pathname);

  async function handleCopy() {
    log('copy');
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logError(err, { action: 'BringAFriendCard.copy' });
    }
  }

  async function handleNative() {
    log('native');
    try {
      await navigator.share({ text: message, url: link });
    } catch (err) {
      // Dismissing the sheet is not an error.
      if (!(err instanceof Error && err.name === 'AbortError')) logError(err, { action: 'BringAFriendCard.native' });
    }
  }

  const secondary =
    'flex flex-1 items-center justify-center gap-2 rounded-xl border-2 border-tribe-dark px-4 py-3 text-sm font-semibold text-tribe-dark dark:border-white dark:text-white';

  return (
    <section
      aria-label={t.title}
      className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 dark:border-tribe-mid dark:bg-tribe-surface"
    >
      <h2 className="text-base font-bold text-tribe-dark dark:text-white">{t.title}</h2>
      <a
        href={whatsappShareUrl(message)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => log('whatsapp')}
        className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-tribe-dark px-5 py-4 text-base font-semibold text-white"
      >
        <MessageCircle className="h-5 w-5" aria-hidden="true" />
        {t.whatsapp}
      </a>
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={handleCopy} className={secondary}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {copied ? t.copied : t.copy}
        </button>
        {canNativeShare ? (
          <button type="button" onClick={handleNative} className={secondary}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {t.more}
          </button>
        ) : null}
      </div>
    </section>
  );
}
