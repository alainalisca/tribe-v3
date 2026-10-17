import type { ReactNode } from 'react';
import p from './pages.module.css';

/** Questions as native <details>: no JavaScript, open and close on tap. */
export type FaqItem = { q: string; a: ReactNode };

export default function Faq({ items, firstOpen = false }: { items: FaqItem[]; firstOpen?: boolean }) {
  return (
    <div className={p.faq}>
      {items.map((item, i) => (
        <details key={item.q} open={firstOpen && i === 0}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
