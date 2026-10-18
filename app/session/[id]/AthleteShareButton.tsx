'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, MessageCircle, Share2 } from 'lucide-react';
import { copyToClipboard, getSessionShareUrl, nativeShare } from '@/lib/share';
import { trackEvent } from '@/lib/analytics';
import { showSuccess } from '@/lib/toast';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-UI-SD1: "Compartir" for athletes. The phone's own share sheet when the
 * browser has one; otherwise (desktop, or a browser that refuses it) a small
 * menu with "Copiar enlace" and "WhatsApp". Closing the share sheet is not an
 * error and opens nothing.
 */
export default function AthleteShareButton({ sessionId, title }: { sessionId: string; title: string }) {
  const t = useTranslations('sessionDetail');
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const url = getSessionShareUrl(sessionId);
  const text = t('shareText', { title });

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const track = (channel: 'native' | 'copy' | 'whatsapp', method: 'native' | 'clipboard' | 'whatsapp') =>
    trackEvent('session_shared', { session_id: sessionId, content_type: 'session', channel, method });

  async function share() {
    const result = await nativeShare({ title: text, url });
    if (result === 'shared') track('native', 'native');
    else if (result === 'unavailable' || result === 'failed') setMenuOpen(true);
  }

  async function copy() {
    setMenuOpen(false);
    if (await copyToClipboard(url)) {
      track('copy', 'clipboard');
      showSuccess(t('linkCopied'));
    }
  }

  const item =
    'w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-stone-900 dark:text-white hover:bg-stone-50 dark:hover:bg-tribe-mid';

  return (
    <div ref={wrapRef} className="relative flex justify-end">
      <button
        type="button"
        onClick={share}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-tribe-green text-slate-900 hover:bg-lime-500 transition text-sm font-semibold"
      >
        <Share2 className="w-4 h-4" />
        {t('share')}
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-52 overflow-hidden rounded-xl border border-stone-200 dark:border-tribe-mid bg-white dark:bg-tribe-card shadow-lg"
        >
          <button type="button" role="menuitem" className={item} onClick={copy}>
            <Link2 className="w-4 h-4 text-muted-foreground" />
            {t('copyLink')}
          </button>
          <a
            role="menuitem"
            className={item}
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setMenuOpen(false);
              track('whatsapp', 'whatsapp');
            }}
          >
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            {t('whatsapp')}
          </a>
        </div>
      )}
    </div>
  );
}
