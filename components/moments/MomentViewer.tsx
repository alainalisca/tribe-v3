'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronLeft, ChevronRight, Download, Heart, Share2, UserMinus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { MyMomentsApi } from '@/lib/moments/myApi';
import type { MyMoment } from '@/lib/moments/types';

/**
 * T-MOM1 Part C: the photo viewer in a person's Momentos. Swipe between the
 * session's photos (native scroll snap), pinch or double-tap to zoom, and four
 * actions under the photo:
 *
 *   Descargar   the original, through a 1-hour signed URL
 *   Gracias     one tap; the uploader hears once per batch
 *   Compartir   Part D (shown, not active yet)
 *   Quitarme    a sheet: "Quitarme de esta foto" (nobody is told) or
 *               "Pedir que la borren" (removed too, the uploader is asked)
 *
 * "Mostrar en la página de <coach>" arrives with Part D.
 */
export default function MomentViewer({
  photos,
  startIndex,
  api,
  onClose,
  onThanked,
  onRemoved,
  initialSheet = false,
}: {
  photos: MyMoment[];
  startIndex: number;
  api: MyMomentsApi;
  onClose: () => void;
  onThanked: (mediaId: string) => void;
  onRemoved: (mediaId: string) => void;
  /** /dev/moments only: open the "Quitarme" sheet, for review. */
  initialSheet?: boolean;
}) {
  const t = useTranslations('moments');
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(Math.min(startIndex, photos.length - 1));
  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState(initialSheet);
  const [busy, setBusy] = useState(false);
  const photo = photos[index];

  useLayoutEffect(() => {
    const el = track.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
    // Only on open: after that the scroll position is the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (photos.length === 0) onClose();
    else if (index > photos.length - 1) setIndex(photos.length - 1);
  }, [photos.length, index, onClose]);

  function onScroll() {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i < photos.length) setIndex(i);
  }

  function go(delta: number) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: (index + delta) * el.clientWidth, behavior: 'smooth' });
  }

  async function download() {
    if (!photo) return;
    try {
      window.location.href = await api.download(photo.mediaId);
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  async function thank() {
    if (!photo || photo.thanked) return;
    onThanked(photo.mediaId);
    try {
      await api.thanks(photo.mediaId);
    } catch {
      toast.error(t('errorGeneric'));
    }
  }

  async function remove(requestDelete: boolean) {
    if (!photo) return;
    setBusy(true);
    try {
      const r = await api.remove(photo.mediaId, requestDelete);
      setSheet(false);
      toast.success(requestDelete && r.requested ? t('requested') : t('removed'));
      onRemoved(photo.mediaId);
    } catch {
      toast.error(t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  const action =
    'flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[12px] font-semibold text-white disabled:opacity-50';

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-testid="moment-viewer"
          className="fixed inset-0 z-50 flex flex-col bg-[#121417] text-white"
          style={{
            paddingTop: 'var(--safe-area-inset-top, 0px)',
            paddingBottom: 'var(--safe-area-inset-bottom, 0px)',
          }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex h-14 items-center justify-between px-2">
            <DialogPrimitive.Close aria-label={t('close')} className="rounded-full p-2.5">
              <X className="h-6 w-6" />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="text-sm font-semibold text-white/80">
              {t('photoOf', { n: index + 1, total: photos.length })}
            </DialogPrimitive.Title>
            <span className="w-11" aria-hidden="true" />
          </div>
          <DialogPrimitive.Description className="sr-only">{t('momentosPrivate')}</DialogPrimitive.Description>

          <div className="relative min-h-0 flex-1">
            <div
              ref={track}
              onScroll={onScroll}
              className="flex h-full snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ overflowX: zoomed ? 'hidden' : 'auto' }}
            >
              {photos.map((p, i) => (
                <div key={p.mediaId} className="relative h-full w-full shrink-0 snap-center overflow-hidden">
                  <ZoomableImage
                    src={p.viewerUrl ?? p.gridUrl}
                    active={i === index}
                    onZoomChange={i === index ? setZoomed : undefined}
                  />
                </div>
              ))}
            </div>
            {index > 0 && (
              <button
                type="button"
                aria-label={t('previous')}
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 md:block"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                type="button"
                aria-label={t('next')}
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 md:block"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-md gap-1 px-3 py-3">
            <button type="button" className={action} onClick={download}>
              <Download className="h-6 w-6" />
              {t('download')}
            </button>
            <button
              type="button"
              className={`${action} ${photo?.thanked ? 'text-[#A8DA36]' : ''}`}
              onClick={thank}
              aria-pressed={!!photo?.thanked}
            >
              {photo?.thanked ? <Check className="h-6 w-6" /> : <Heart className="h-6 w-6" />}
              {photo?.thanked ? t('thanked') : t('thanks')}
            </button>
            <button type="button" className={action} disabled aria-describedby="share-soon">
              <Share2 className="h-6 w-6" />
              <span className="flex flex-col leading-tight">
                {t('share')}
                <span id="share-soon" className="text-[10px] font-normal uppercase tracking-wide text-white/60">
                  {t('soon')}
                </span>
              </span>
            </button>
            <button type="button" className={action} onClick={() => setSheet(true)}>
              <UserMinus className="h-6 w-6" />
              {t('removeConfirm')}
            </button>
          </div>

          {sheet && (
            <div className="fixed inset-0 z-[60] flex items-end bg-black/50" onClick={() => !busy && setSheet(false)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="remove-title"
                data-testid="remove-sheet"
                onClick={(e) => e.stopPropagation()}
                className="mx-auto w-full max-w-md rounded-t-[22px] bg-white px-4 pt-4 text-stone-900"
                style={{ paddingBottom: 'calc(16px + var(--safe-area-inset-bottom, 0px))' }}
              >
                <div className="mx-auto mb-3 h-1 w-10 rounded bg-stone-200" aria-hidden="true" />
                <h2 id="remove-title" className="text-lg font-extrabold">
                  {t('removeTitle')}
                </h2>
                <p className="mt-1 text-sm text-stone-600">{t('removeBody')}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(false)}
                  className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-[15px] font-extrabold text-white disabled:opacity-60"
                >
                  {t('removeMe')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(true)}
                  className="mt-2 w-full rounded-xl border-[1.5px] border-stone-900 py-3 text-[15px] font-bold disabled:opacity-60"
                >
                  {t('askDelete')}
                </button>
                <p className="mt-1.5 text-center text-xs text-stone-500">{t('askDeleteHint')}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSheet(false)}
                  className="mt-2 w-full py-2.5 text-sm font-semibold text-stone-600"
                >
                  {t('back')}
                </button>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };
const MAX_ZOOM = 4;

/** Clamp the pan so the photo never leaves the frame. */
export function clampPan(z: Zoom, w: number, h: number): Zoom {
  const mx = ((z.s - 1) * w) / 2;
  const my = ((z.s - 1) * h) / 2;
  return { s: z.s, x: Math.max(-mx, Math.min(mx, z.x)), y: Math.max(-my, Math.min(my, z.y)) };
}

/**
 * One photo that pinches (two pointers), pans when zoomed (one pointer) and
 * toggles 2x on a double tap. Unzoomed it lets horizontal swipes through to
 * the track (touch-action: pan-x); zoomed it keeps every gesture.
 */
function ZoomableImage({
  src,
  active,
  onZoomChange,
}: {
  src: string | null;
  active: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState<Zoom>(NO_ZOOM);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const lastTap = useRef(0);
  const [gesture, setGesture] = useState(false);

  useEffect(() => {
    if (!active) setZ(NO_ZOOM);
  }, [active]);
  useEffect(() => {
    onZoomChange?.(z.s > 1);
  }, [z.s, onZoomChange]);

  const size = () => ({ w: box.current?.clientWidth ?? 1, h: box.current?.clientHeight ?? 1 });
  const distance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function down(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGesture(true);
    if (pointers.current.size === 2) {
      pinch.current = { dist: distance(), s: z.s };
      pan.current = null;
    } else if (pointers.current.size === 1 && z.s > 1) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pan.current = { x: z.x, y: z.y, px: e.clientX, py: e.clientY };
    }
  }

  function move(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const { w, h } = size();
    if (pinch.current && pointers.current.size === 2) {
      const s = Math.max(1, Math.min(MAX_ZOOM, (pinch.current.s * distance()) / pinch.current.dist));
      setZ((prev) => clampPan({ ...prev, s }, w, h));
    } else if (pan.current) {
      const p = pan.current;
      setZ((prev) => clampPan({ s: prev.s, x: p.x + e.clientX - p.px, y: p.y + e.clientY - p.py }, w, h));
    }
  }

  function up(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      pan.current = null;
      setGesture(false);
      setZ((prev) => (prev.s <= 1.02 ? NO_ZOOM : prev));
      if (e.type === 'pointerup') {
        const now = Date.now();
        if (now - lastTap.current < 280) {
          setZ((prev) => (prev.s > 1 ? NO_ZOOM : { s: 2, x: 0, y: 0 }));
          lastTap.current = 0;
        } else lastTap.current = now;
      }
    }
  }

  return (
    <div
      ref={box}
      className="flex h-full w-full items-center justify-center"
      style={{ touchAction: z.s > 1 ? 'none' : 'pan-x' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {src && (
        // A private photo behind a signed URL: a plain img, never the optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`,
            transition: gesture ? 'none' : 'transform 120ms ease-out',
          }}
        />
      )}
    </div>
  );
}
