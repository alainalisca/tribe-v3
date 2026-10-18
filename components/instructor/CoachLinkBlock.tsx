'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Link as LinkIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { coachLink, whatsappShareHref } from '@/lib/coachLink';
import { fetchCoachLink } from '@/lib/dal/coachLink';
import { showError, showSuccess } from '@/lib/toast';

/**
 * T-SHARE1 Part C: "Tu link", the coach's own page in one line, a Copy button
 * and "Compartir por WhatsApp". On the instructor dashboard and as a row on the
 * coach's own profile. No count yet: who arrives through the link is T-GROW1;
 * the line under it says where that will show.
 */
export default function CoachLinkBlock({
  userId,
  language,
  className = '',
}: {
  userId: string;
  language: 'es' | 'en';
  className?: string;
}) {
  const t = useTranslations('coachLink');
  const [handle, setHandle] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    fetchCoachLink(createClient(), userId).then((r) => {
      if (live) setHandle(r.success && r.data ? r.data.handle : null);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  if (handle === undefined) return null;
  const link = coachLink({ id: userId, handle });
  const shown = link.replace(/^https:\/\//, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      showSuccess(t('copied'));
    } catch {
      showError(t('copyFailed'));
    }
  }

  return (
    <section
      aria-labelledby="tu-link-title"
      className={`rounded-2xl border border-stone-200 dark:border-tribe-mid bg-white dark:bg-tribe-surface p-4 ${className}`}
    >
      <h2 id="tu-link-title" className="flex items-center gap-2 text-sm font-bold text-theme-primary">
        <LinkIcon className="w-4 h-4" aria-hidden="true" />
        {t('title')}
      </h2>
      <p className="mt-2 font-mono text-sm text-theme-primary break-all">{shown}</p>
      {!handle && (
        <Link href="/profile/edit#tu-link" className="mt-1 inline-block text-xs text-tribe-green-dark underline">
          {t('chooseHandle')}
        </Link>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-2 rounded-xl border border-stone-300 dark:border-tribe-mid px-4 py-2 text-sm font-semibold text-theme-primary hover:border-tribe-green transition"
        >
          <Copy className="w-4 h-4" aria-hidden="true" />
          {t('copy')}
        </button>
        <a
          href={whatsappShareHref(link, language)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-tribe-green px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-tribe-green-hover transition"
        >
          {t('whatsapp')}
        </a>
      </div>
      <p className="mt-3 text-xs text-theme-secondary">{t('note')}</p>
    </section>
  );
}
