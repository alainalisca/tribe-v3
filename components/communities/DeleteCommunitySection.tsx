'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { typedNameMatches } from '@/lib/communityDeleteConfirm';

export interface DeleteCommunitySectionProps {
  /** The SAVED name, not whatever is in the edit form right now. */
  communityName: string;
  /** Resolves to an error message, or null on success. */
  onDelete: (typedName: string) => Promise<string | null>;
}

/**
 * Creator-only danger zone on /communities/[id]/edit. Deleting takes the
 * community away from every member, so the confirmation is typing its name,
 * not a yes/no dialog. The server checks the same name again.
 */
export default function DeleteCommunitySection({ communityName, onDelete }: DeleteCommunitySectionProps) {
  const t = useTranslations('communityEdit');
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = typedNameMatches(typed, communityName);

  async function handleDelete() {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    const message = await onDelete(typed);
    // On success the page navigates away; only a failure comes back here.
    if (message) {
      setError(message);
      setDeleting(false);
    }
  }

  function cancel() {
    setOpen(false);
    setTyped('');
    setError(null);
  }

  return (
    <section className="mt-12 rounded-lg border border-red-300 dark:border-red-900/60 p-4 space-y-3">
      <h2 className="text-base font-bold text-red-600 dark:text-red-400">{t('dangerTitle')}</h2>
      <p className="text-sm text-stone-600 dark:text-gray-400">{t('dangerBody')}</p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 px-4 rounded-lg border-2 border-red-500 text-red-600 dark:text-red-400 font-semibold flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/10"
        >
          <Trash2 className="w-4 h-4" />
          {t('deleteButton')}
        </button>
      ) : (
        <div className="space-y-3">
          <label htmlFor="community-delete-confirm" className="block text-sm text-theme-primary">
            {t('deleteConfirmLabel')} <strong className="font-semibold">{communityName}</strong>
          </label>
          <input
            id="community-delete-confirm"
            type="text"
            value={typed}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => {
              setTyped(e.target.value);
              setError(null);
            }}
            className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          {error && (
            <p role="alert" className="text-red-500 text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={cancel}
              disabled={deleting}
              className="flex-1 h-11 rounded-lg border border-stone-300 dark:border-tribe-card text-theme-primary font-semibold disabled:opacity-60"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || deleting}
              className="flex-1 h-11 rounded-lg bg-red-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting ? t('deleting') : t('deleteConfirm')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
