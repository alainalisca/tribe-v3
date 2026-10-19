'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { PhotographerPerson, PhotographersState } from '@/lib/moments/photographers';

/**
 * T-MOM1 Part C: "Fotógrafo de esta sesión". Who may upload and tag this
 * session's photos besides the host; add someone by their exact Tribe handle,
 * or pick from the people in the session.
 */
export default function PhotographersScreen({ sessionId, initial }: { sessionId: string; initial: PhotographersState }) {
  const t = useTranslations('moments');
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [handleError, setHandleError] = useState<string | null>(null);

  async function send(method: 'POST' | 'DELETE', body: { userId: string } | { handle: string }) {
    const res = await fetch(`/api/moments/${sessionId}/photographers/`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) setState(await res.json());
    return res;
  }

  async function change(userId: string, method: 'POST' | 'DELETE') {
    setBusy(userId);
    try {
      if (!(await send(method, { userId })).ok) throw new Error('failed');
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  async function addByHandle(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;
    setBusy('handle');
    setHandleError(null);
    try {
      const res = await send('POST', { handle });
      if (res.ok) setHandle('');
      else {
        const code = ((await res.json().catch(() => ({}))) as { error?: string }).error;
        setHandleError(
          code === 'is_host'
            ? t('photographersHandleIsHost')
            : code === 'handle_not_found' || code === 'bad_request'
              ? t('photographersHandleNotFound')
              : t('errorGeneric')
        );
      }
    } catch {
      setHandleError(t('errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  const person = (p: PhotographerPerson, action: React.ReactNode) => (
    <li key={p.id} className="flex items-center gap-3 border-b border-stone-200 py-3 dark:border-tribe-mid">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-sm font-bold text-stone-700 dark:bg-tribe-mid dark:text-white">
        {p.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          p.name.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-stone-900 dark:text-white">{p.name}</span>
      {action}
    </li>
  );

  return (
    <div className="min-h-screen bg-[#F7F8F6] pb-16 dark:bg-tribe-dark">
      <header
        className="sticky top-0 z-30 border-b border-stone-200 bg-[#F7F8F6]/95 backdrop-blur dark:border-tribe-mid dark:bg-tribe-dark/95"
        style={{ paddingTop: 'var(--safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-2">
          <Link
            href={`/session/${sessionId}/`}
            aria-label={t('back')}
            className="rounded-full p-2.5 text-stone-900 dark:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-stone-900 dark:text-white">{t('photographersTitle')}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-4">
        <p className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
          <Camera className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('photographersHint')}
        </p>
        <section aria-label={t('photographersCurrent')}>
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{t('photographersCurrent')}</h2>
          {state.photographers.length === 0 ? (
            <p className="py-3 text-sm text-stone-500">{t('photographersNone')}</p>
          ) : (
            <ul>
              {state.photographers.map((p) =>
                person(
                  p,
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => change(p.id, 'DELETE')}
                    className="rounded-xl border-[1.5px] border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-700 disabled:opacity-50"
                  >
                    {t('photographersRemove')}
                  </button>
                )
              )}
            </ul>
          )}
        </section>
        <section aria-label={t('photographersByHandle')}>
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{t('photographersByHandle')}</h2>
          <form onSubmit={addByHandle} className="mt-2 flex gap-2">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={t('photographersHandlePlaceholder')}
              aria-label={t('photographersByHandle')}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={40}
              className="min-w-0 flex-1 rounded-xl border-[1.5px] border-stone-300 bg-white px-3 py-2 text-[15px] text-stone-900"
            />
            <button
              type="submit"
              disabled={busy === 'handle' || !handle.trim()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {t('photographersAdd')}
            </button>
          </form>
          {handleError && (
            <p role="alert" className="mt-1.5 text-sm font-semibold text-red-600">
              {handleError}
            </p>
          )}
        </section>
        <section aria-label={t('photographersPick')}>
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{t('photographersPick')}</h2>
          {state.candidates.length === 0 ? (
            <p className="py-3 text-sm text-stone-500">{t('photographersRosterEmpty')}</p>
          ) : (
            <ul>
              {state.candidates.map((p) =>
                person(
                  p,
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => change(p.id, 'POST')}
                    className="rounded-xl bg-stone-900 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {t('photographersAdd')}
                  </button>
                )
              )}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
