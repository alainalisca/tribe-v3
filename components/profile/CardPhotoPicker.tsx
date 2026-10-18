'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import {
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CardBox } from '@/lib/og/cardCrop';

/**
 * T-SHARE1 Part C: "Foto de tu link". The coach's cover and gallery photos as
 * card-shaped thumbnails (1.105:1, the share card's photo); pick one, drag the
 * box to where you want the crop, save. The box is the largest card-shaped
 * area the photo holds, so dragging only moves it. Used on the coach's profile
 * editor and, for any coach, in admin (the caller decides how to save).
 */
export const CARD_RATIO = 696 / 630;

/** The box's size as fractions of a photo of w x h: the largest card-shaped area in it. */
export function boxSize(w: number, h: number): { bw: number; bh: number } {
  if (!w || !h) return { bw: 1, bh: 1 };
  return w / h > CARD_RATIO ? { bw: (h * CARD_RATIO) / w, bh: 1 } : { bw: 1, bh: w / CARD_RATIO / h };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

/** Where the box starts: the saved one when it is this photo's, else centred across with its middle on the upper third. */
export function startBox(bw: number, bh: number, saved: CardBox | null): { x0: number; y0: number } {
  if (saved) return { x0: clamp(saved.x0, 0, 1 - bw), y0: clamp(saved.y0, 0, 1 - bh) };
  return { x0: (1 - bw) / 2, y0: clamp(1 / 3 - bh / 2, 0, 1 - bh) };
}

export default function CardPhotoPicker({
  photos,
  initialUrl,
  initialBox,
  onSave,
}: {
  photos: string[];
  initialUrl: string | null;
  initialBox: CardBox | null;
  onSave: (url: string, box: CardBox) => Promise<boolean>;
}) {
  const t = useTranslations('coachLink');
  const [url, setUrl] = useState<string | null>(initialUrl && photos.includes(initialUrl) ? initialUrl : null);
  const [size, setSize] = useState<{ bw: number; bh: number } | null>(null);
  const [pos, setPos] = useState<{ x0: number; y0: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; x0: number; y0: number } | null>(null);

  function pick(next: string) {
    setUrl(next);
    setSize(null);
    setPos(null);
  }

  function loaded(img: HTMLImageElement) {
    const s = boxSize(img.naturalWidth, img.naturalHeight);
    setSize(s);
    setPos(startBox(s.bw, s.bh, url === initialUrl ? initialBox : null));
  }

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pos) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, x0: pos.x0, y0: pos.y0 };
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || !rect || !size) return;
    setPos({
      x0: clamp(d.x0 + (e.clientX - d.x) / rect.width, 0, 1 - size.bw),
      y0: clamp(d.y0 + (e.clientY - d.y) / rect.height, 0, 1 - size.bh),
    });
  }

  /** Arrow keys move the box two percent at a time, for anyone not dragging. */
  function key(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!pos || !size) return;
    const step = 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setPos({ x0: clamp(pos.x0 + d[0], 0, 1 - size.bw), y0: clamp(pos.y0 + d[1], 0, 1 - size.bh) });
  }

  async function save() {
    if (!url || !pos || !size) return;
    setSaving(true);
    try {
      await onSave(url, {
        x0: round(pos.x0),
        y0: round(pos.y0),
        x1: round(Math.min(1, pos.x0 + size.bw)),
        y1: round(Math.min(1, pos.y0 + size.bh)),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-theme-primary">{t('photoTitle')}</h3>
      <p className="mt-1 text-xs text-theme-secondary">{t('photoHelp')}</p>

      {photos.length === 0 ? (
        <p className="mt-3 text-xs text-theme-secondary">{t('photoEmpty')}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-2" aria-label={t('photosLabel')}>
          {photos.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => pick(p)}
                aria-pressed={url === p}
                aria-label={t('photoN', { n: i + 1 })}
                className={`block w-full overflow-hidden rounded-lg border-2 ${url === p ? 'border-tribe-green' : 'border-transparent'}`}
                style={{ aspectRatio: `${CARD_RATIO}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {url && (
        <div className="mt-4">
          <div ref={frame} className="relative w-full overflow-hidden rounded-lg select-none touch-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="block w-full" onLoad={(e) => loaded(e.currentTarget)} draggable={false} />
            {size && pos && (
              <div
                role="slider"
                tabIndex={0}
                aria-label={t('boxLabel')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos.y0 * 100)}
                aria-valuetext={`${Math.round(pos.x0 * 100)}% ${Math.round(pos.y0 * 100)}%`}
                onKeyDown={key}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                className="absolute cursor-move border-2 border-tribe-green"
                style={{
                  left: `${pos.x0 * 100}%`,
                  top: `${pos.y0 * 100}%`,
                  width: `${size.bw * 100}%`,
                  height: `${size.bh * 100}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                }}
              />
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || !pos}
            className="mt-3 w-full rounded-xl bg-tribe-green py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {saving ? t('saving') : t('savePhoto')}
          </button>
        </div>
      )}
    </div>
  );
}
