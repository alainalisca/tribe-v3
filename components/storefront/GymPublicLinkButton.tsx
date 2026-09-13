'use client';

/**
 * "Copy public link" — owner-only, on the gym's own storefront.
 *
 * BullBox needs a URL for their Instagram bio and has no way to discover one:
 * /storefront/[id] is the owner console and is auth-gated, so the address bar
 * shows a link that is useless to their followers. Without this the only way a
 * partner learns their /g/[slug] URL is somebody telling them.
 *
 * Renders nothing for a visitor. The slug is public, but the instruction to put
 * it in a bio is addressed to the owner.
 */
import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { haptic } from '@/lib/haptics';

export default function GymPublicLinkButton({ slug }: { slug: string | null | undefined }) {
  const t = useTranslations('gymPage');
  const [copied, setCopied] = useState(false);

  // A partner row from before 163's backfill would have no slug. Nothing to
  // copy, so nothing to show.
  if (!slug) return null;

  const url = `${typeof window === 'undefined' ? '' : window.location.origin}/g/${slug}/`;

  async function copy() {
    haptic('light');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Clipboard is unavailable over plain http and inside some in-app
      // browsers. Surfacing the URL is better than a button that silently does
      // nothing, and the owner can select it by hand.
      console.error('[GymPublicLinkButton] clipboard write failed', err);
      window.prompt(t('copyLink'), url);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 rounded-xl border border-theme bg-theme-inset px-3 py-2 text-sm font-semibold text-theme-primary"
      >
        {copied ? <Check className="w-4 h-4 text-tribe-green-dark" /> : <Link2 className="w-4 h-4" />}
        {copied ? t('copyLinkDone') : t('copyLink')}
      </button>
      <p className="mt-1 text-xs text-theme-tertiary">{t('copyLinkHelp')}</p>
      {/* The URL itself, because a copy button gives no way to check what it
          copied — and this string is permanent once it is in a bio. */}
      <p className="mt-0.5 break-all font-mono text-[11px] text-theme-tertiary">{url}</p>
    </div>
  );
}
