import type { ReactNode } from 'react';
import c from './chrome.module.css';

/** One ticker item: a short tag and its text. */
export type TickerItem = { id: string; tag: ReactNode; text: ReactNode };

/**
 * The lime ticker above the nav. Decorative and duplicated for the loop, so it
 * is hidden from assistive tech; every fact in it is also on the page. The
 * animation stops under prefers-reduced-motion (base.module.css).
 */
export default function Ticker({ items }: { items: TickerItem[] }) {
  const run = (copy: string) =>
    items.map((item) => (
      <span key={`${copy}-${item.id}`}>
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
