import type { ReactNode } from 'react';
import p from './pages.module.css';

/** Numbered steps (mock .steps). `extra` is an optional link under a step. */
export type Step = { title: string; body: string; extra?: ReactNode };

export default function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className={p.steps}>
      {steps.map((s, i) => (
        <li key={s.title}>
          <span className={p.n} aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
          {s.extra}
        </li>
      ))}
    </ol>
  );
}
