import type { ReactNode } from 'react';
import c from './chrome.module.css';

/** One ticker item: a short tag and its text. */
export type TickerItem = { id: string; tag: ReactNode; text: ReactNode };

/**
 * The lime ticker above the nav. Decorative and duplicated for the loop, so it
 * is hidden from assistive tech; every fact in it is also on the page. The
 * animation stops under prefers-reduced-motion (base.module.css).
 *
 * The first item of each copy is `lead` (T-SITE1.1): it rests fully on screen
 * at load and never runs past the ticker's edge, whatever its length; a long
 * one ends in an ellipsis. Both copies carry it, so the loop stays seamless.
 */
export default function Ticker({ items }: { items: TickerItem[] }) {
  const run = (copy: string) =>
    items.map((item, i) => (
      <span key={`${copy}-${item.id}`} className={i === 0 ? c.lead : undefined}>
        <b>{item.tag}</b>
        {item.text}
      </span>
    ));
  return (
    <div className={c.ticker} aria-hidden="true">
      <div className={c.run}>
        {run('a')}
        {run('b')}
      </div>
    </div>
  );
}
