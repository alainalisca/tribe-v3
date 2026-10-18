'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { handleProblem, isTribeStorageUrl, normalizeHandle, suggestHandle, type HandleProblem } from '@/lib/coachLink';
import { fetchCoachLink, isHandleTaken, saveCardPhoto, saveHandle, type CoachLinkRow } from '@/lib/dal/coachLink';
import { showError, showSuccess } from '@/lib/toast';
import CardPhotoPicker from './CardPhotoPicker';

/**
 * T-SHARE1 Part C, on the instructor's profile editor: their link name
 * (users.handle: tribelatam.com/i/<handle>) and the photo their link's share
 * card shows. Both save on their own button, apart from the profile form.
 * A coach with no handle yet finds one suggested from their first name.
 */
const PROBLEM: Record<HandleProblem | 'taken', string> = {
  short: 'problemShort',
  long: 'problemLong',
  chars: 'problemChars',
  taken: 'problemTaken',
};

export default function CoachLinkEditor({ userId }: { userId: string }) {
  const t = useTranslations('coachLink');
  const [row, setRow] = useState<CoachLinkRow | null>(null);
  const [handle, setHandle] = useState('');
  const [suggested, setSuggested] = useState(false);
  const [problem, setProblem] = useState<HandleProblem | 'taken' | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    const supabase = createClient();
    fetchCoachLink(supabase, userId).then(async (r) => {
      if (!live || !r.success || !r.data) return;
      setRow(r.data);
      if (r.data.handle) {
        setHandle(r.data.handle);
        return;
      }
      // First visit with no handle: suggest one from the first name, if free.
      const idea = suggestHandle(r.data.name);
      if (idea && (await isHandleTaken(supabase, idea, userId)) === false && live) {
        setHandle(idea);
        setSuggested(true);
      }
    });
    return () => {
      live = false;
    };
  }, [userId]);

  if (!row) return null;

  async function submitHandle() {
    const next = normalizeHandle(handle);
    const local = handleProblem(next);
    setProblem(local);
    if (local) return;
    setSaving(true);
    try {
      const r = await saveHandle(createClient(), userId, next);
      if (r.success) {
        setHandle(next);
        setSuggested(false);
        setRow((old) => (old ? { ...old, handle: next } : old));
        showSuccess(t('linkSaved'));
      } else if (r.reason === 'taken' || r.reason === 'format') {
        setProblem(r.reason === 'taken' ? 'taken' : 'chars');
      } else {
        showError(t('linkFailed'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitPhoto(url: string, box: { x0: number; y0: number; x1: number; y1: number }) {
    const r = await saveCardPhoto(createClient(), userId, url, box);
    if (r.success) {
      setRow((old) => (old ? { ...old, card_photo_url: url, card_photo_box: box } : old));
      showSuccess(t('photoSaved'));
      return true;
    }
    showError(t('photoFailed'));
    return false;
  }

  // Only photos in Tribe storage: the card never draws a hotlink.
  const photos = [...new Set([row.cover_image_url, ...(row.photos ?? [])])].filter((u): u is string =>
    isTribeStorageUrl(u)
  );

  return (
    <section
      id="tu-link"
      aria-labelledby="tu-link-editor-title"
      className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid space-y-6"
    >
      <div>
        <h3 id="tu-link-editor-title" className="text-sm font-bold text-theme-primary">
          {t('title')}
        </h3>
        <p className="mt-1 text-xs text-theme-secondary">{t('editorHelp')}</p>
        <label htmlFor="coach-handle" className="sr-only">
          {t('handleLabel')}
        </label>
        <div className="mt-3 flex items-center rounded-lg border border-stone-300 dark:border-tribe-mid overflow-hidden">
          <span className="pl-3 pr-1 font-mono text-sm text-theme-secondary whitespace-nowrap">tribelatam.com/i/</span>
          <input
            id="coach-handle"
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setProblem(null);
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={24}
            aria-invalid={problem !== null}
            aria-describedby="coach-handle-help"
            className="flex-1 min-w-0 bg-transparent py-2 pr-3 font-mono text-sm text-theme-primary outline-none"
          />
        </div>
        <p id="coach-handle-help" className={`mt-1 text-xs ${problem ? 'text-red-600' : 'text-theme-secondary'}`}>
          {problem ? t(PROBLEM[problem]) : suggested ? t('hintSuggested') : t('hintRule')}
        </p>
        <button
          type="button"
          onClick={submitHandle}
          disabled={saving || normalizeHandle(handle) === row.handle}
          className="mt-3 w-full rounded-xl bg-tribe-green py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {saving ? t('saving') : t('saveLink')}
        </button>
      </div>

      <CardPhotoPicker
        photos={photos}
        initialUrl={row.card_photo_url}
        initialBox={row.card_photo_box}
        onSave={submitPhoto}
      />
    </section>
  );
}
