'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { StripTile } from '@/lib/moments/coachStrip';
import s from './coachMoments.module.css';

export type StripLabels = { close: string; photoOf: string; open: string };
const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * T-MOM1 Part D: the "Momentos" strip on a coach's page. Square tiles with the
 * black caption tag (session, date), newest first; a tap opens the photo at
 * 1200 px in a plain viewer (swipe between them), with no download. Which
 * photos appear, and whether the strip appears at all, is decided on the
 * server (lib/moments/coachStrip.ts). Words come in as props, in the page's
 * language.
 */
export default function CoachMomentsStrip({
  tiles,
  labels,
}: {
  tiles: StripTile[];
  /** Templates: photoOf has {n} and {total}, open has {caption}. */
  labels: StripLabels;
}) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <ul className={s.strip} data-testid="coach-moments">
        {tiles.map((tile, i) => (
          <li key={tile.mediaId} className={s.item}>
            <button type="button" className={s.tile} onClick={() => setOpen(i)} aria-label={fill(labels.open, { caption: tile.caption })}>
              {tile.gridUrl && (
                // A signed URL to a private photo: a plain img, never the optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tile.gridUrl} alt="" loading="lazy" />
              )}
              <span className={s.caption}>{tile.caption}</span>
            </button>
          </li>
        ))}
      </ul>
      {open !== null && <StripViewer tiles={tiles} start={open} labels={labels} onClose={() => setOpen(null)} />}
    </>
  );
}

function StripViewer({
  tiles,
  start,
  labels,
  onClose,
}: {
  tiles: StripTile[];
  start: number;
  labels: StripLabels;
  onClose: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  useLayoutEffect(() => {
    if (track.current) track.current.scrollLeft = start * track.current.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className={s.viewer} onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className={s.viewerTop}>
            <DialogPrimitive.Close aria-label={labels.close} className={s.close}>
              <X size={24} />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className={s.count}>{fill(labels.photoOf, { n: index + 1, total: tiles.length })}</DialogPrimitive.Title>
            <span className={s.spacer} aria-hidden="true" />
          </div>
          <DialogPrimitive.Description className={s.srOnly}>{tiles[index]?.caption}</DialogPrimitive.Description>
          <div
            ref={track}
            className={s.track}
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
            }}
          >
            {tiles.map((tile) => (
              <div key={tile.mediaId} className={s.slide}>
                {(tile.viewerUrl ?? tile.gridUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tile.viewerUrl ?? tile.gridUrl ?? ''} alt="" draggable={false} />
                )}
                <span className={s.slideCaption}>{tile.caption}</span>
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
