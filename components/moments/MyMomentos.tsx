'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { PosterHeader } from '@/components/bridge';
import MomentViewer from '@/components/moments/MomentViewer';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { hostFirstName } from '@/lib/share/sessionPublic';
import { translateSport } from '@/lib/sportTranslationData';
import type { MyMomentsApi } from '@/lib/moments/myApi';
import type { MyMomentsBatch } from '@/lib/moments/types';

/**
 * T-MOM1 Part C: a person's Momentos (/profile/momentos/). Private: only the
 * signed-in person's own photos, after "Entregar". One section per session,
 * newest first, each under a PosterHeader (the session, the coach and date,
 * "N fotos"), then the grid. A session shows its first six photos until "Ver
 * las N"; the deep link (?s=<session>) opens that session's batch and scrolls
 * to it. A tap opens the viewer.
 */
const PREVIEW = 6;

export function batchTitle(b: Pick<MyMomentsBatch, 'title' | 'sport'>, lang: 'es' | 'en'): string {
  return (
    b.title?.trim() ||
    (b.sport && b.sport !== 'Other' ? translateSport(b.sport, lang) : lang === 'en' ? 'Session' : 'Sesión')
  );
}

export function batchDate(date: string, lang: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(`${date}T12:00:00`))
    .replace(/\./g, '');
}

export default function MyMomentos({
  initial,
  api,
  openSessionId = null,
  initialViewer = null,
}: {
  initial: MyMomentsBatch[];
  api: MyMomentsApi;
  openSessionId?: string | null;
  /** /dev/moments only: open the viewer (and its sheet) on load, for review. */
  initialViewer?: { sessionId: string; index: number; sheet?: boolean } | null;
}) {
  const t = useTranslations('moments');
  const { language } = useLanguage();
  const lang: 'es' | 'en' = language === 'en' ? 'en' : 'es'; // eslint-disable-line no-restricted-syntax -- a locale for formatting, not copy
  const [batches, setBatches] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(openSessionId ? [openSessionId] : []));
  const [viewer, setViewer] = useState(initialViewer);

  useEffect(() => {
    if (!openSessionId) return;
    document.getElementById(`momentos-${openSessionId}`)?.scrollIntoView({ block: 'start' });
  }, [openSessionId]);

  const photosLabel = (n: number) => (n === 1 ? t('photosOne') : t('photosCount', { count: n }));

  const onThanked = useCallback((mediaId: string) => {
    setBatches((list) =>
      list.map((b) => ({ ...b, photos: b.photos.map((p) => (p.mediaId === mediaId ? { ...p, thanked: true } : p)) }))
    );
  }, []);
  const onRemoved = useCallback((mediaId: string) => {
    setBatches((list) =>
      list
        .map((b) => ({ ...b, photos: b.photos.filter((p) => p.mediaId !== mediaId) }))
        .filter((b) => b.photos.length > 0)
    );
  }, []);
  const closeViewer = useCallback(() => setViewer(null), []);

  const open = viewer ? batches.find((b) => b.sessionId === viewer.sessionId) : null;

  return (
    <div className="min-h-screen bg-[#F7F8F6] pb-16 dark:bg-tribe-dark">
      <header
        className="sticky top-0 z-30 border-b border-stone-200 bg-[#F7F8F6]/95 backdrop-blur dark:border-tribe-mid dark:bg-tribe-dark/95"
        style={{ paddingTop: 'var(--safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex h-14 max-w-[560px] items-center gap-2 px-2">
          <Link href="/profile/" aria-label={t('back')} className="rounded-full p-2.5 text-stone-900 dark:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-extrabold text-stone-900 dark:text-white">{t('momentosTitle')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-[560px]">
        <p className="flex items-center gap-1.5 px-4 py-3 text-sm text-stone-600 dark:text-stone-300">
          <Lock className="h-4 w-4" aria-hidden="true" />
          {t('momentosPrivate')}
        </p>

        {batches.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-stone-500">{t('momentosEmpty')}</p>
        ) : (
          batches.map((b) => {
            const all = expanded.has(b.sessionId);
            const shown = all ? b.photos : b.photos.slice(0, PREVIEW);
            const coach = hostFirstName(b.coachName, b.sport);
            const date = batchDate(b.date, lang);
            return (
              <section
                key={b.sessionId}
                id={`momentos-${b.sessionId}`}
                aria-label={batchTitle(b, lang)}
                className="mb-8 scroll-mt-16"
              >
                <PosterHeader
                  title={batchTitle(b, lang)}
                  sport={b.sport ? translateSport(b.sport, lang) : null}
                  photoUrl={b.photos[0]?.viewerUrl ?? b.photos[0]?.gridUrl ?? null}
                  caption={coach ? `${coach} · ${date}` : date}
                  tag={photosLabel(b.photos.length)}
                  headingLevel={2}
                  plainImage
                />
                <div className="mt-1 grid grid-cols-3 gap-1 px-1">
                  {shown.map((p) => (
                    <button
                      key={p.mediaId}
                      type="button"
                      onClick={() =>
                        setViewer({ sessionId: b.sessionId, index: b.photos.findIndex((x) => x.mediaId === p.mediaId) })
                      }
                      aria-label={t('photoOf', {
                        n: b.photos.findIndex((x) => x.mediaId === p.mediaId) + 1,
                        total: b.photos.length,
                      })}
                      className="relative aspect-square overflow-hidden bg-stone-200"
                    >
                      {p.gridUrl && (
                        // A private photo behind a signed URL: a plain img, never the optimizer.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.gridUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </button>
                  ))}
                </div>
                {!all && b.photos.length > PREVIEW && (
                  <button
                    type="button"
                    onClick={() => setExpanded((s) => new Set(s).add(b.sessionId))}
                    className="mx-4 mt-2 w-[calc(100%-2rem)] rounded-xl border-[1.5px] border-stone-900 py-2.5 text-sm font-bold text-stone-900 dark:border-white dark:text-white"
                  >
                    {t('seeAll', { count: b.photos.length })}
                  </button>
                )}
              </section>
            );
          })
        )}
      </main>

      {open && viewer && (
        <MomentViewer
          key={open.sessionId}
          photos={open.photos}
          startIndex={viewer.index}
          api={api}
          onClose={closeViewer}
          onThanked={onThanked}
          onRemoved={onRemoved}
          initialSheet={!!viewer.sheet}
        />
      )}
    </div>
  );
}
