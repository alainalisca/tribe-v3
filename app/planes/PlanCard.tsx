'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import type { PlanCopy, PlanesCopy } from './planesCopy';

export type PlanCardAction =
  | { kind: 'link'; href: string }
  | { kind: 'checkout'; onClick: () => void; disabled: boolean; busy: boolean }
  | { kind: 'manage'; onClick: () => void; disabled: boolean; busy: boolean };

interface PlanCardProps {
  copy: PlanCopy;
  c: PlanesCopy;
  /** "89.000", or null for Básico (free). */
  amount: string | null;
  recommended?: boolean;
  founding?: boolean;
  isCurrent: boolean;
  action: PlanCardAction;
  className?: string;
}

/**
 * One plan. The recommended plan is the dark card: it is the one decision the
 * page wants a coach to make, so it is the one thing that is not white.
 */
export default function PlanCard({
  copy,
  c,
  amount,
  recommended,
  founding,
  isCurrent,
  action,
  className = '',
}: PlanCardProps) {
  const dark = Boolean(recommended);
  const btnBase =
    'block w-full text-center rounded-2xl py-4 text-base font-bold transition motion-safe:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tribe-green disabled:opacity-60';
  const btn = dark
    ? `${btnBase} bg-tribe-green text-tribe-dark hover:bg-tribe-green-100`
    : `${btnBase} bg-tribe-dark text-white hover:bg-tribe-dark-80`;

  return (
    <article
      className={`relative flex flex-col rounded-3xl p-6 sm:p-7 motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-1 ${
        dark
          ? 'bg-tribe-dark text-white shadow-xl shadow-tribe-dark/20'
          : 'bg-white text-tribe-dark border border-tribe-dark-60/60'
      } ${isCurrent ? 'ring-4 ring-tribe-green' : ''} ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 min-h-6">
        {recommended && (
          <span className="rounded-full bg-tribe-green px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-tribe-dark">
            {c.recommended}
          </span>
        )}
        {founding && (
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
              dark ? 'bg-white/10 text-white' : 'bg-tribe-dark-40 text-tribe-dark'
            }`}
          >
            {c.founding}
          </span>
        )}
        {isCurrent && (
          <span
            className={`text-[11px] font-extrabold uppercase tracking-wider ${dark ? 'text-tribe-green' : 'text-tribe-green-dark'}`}
          >
            {c.currentPlan}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-2xl font-extrabold tracking-tight">{copy.name}</h3>
      <p className={`text-sm ${dark ? 'text-tribe-dark-60' : 'text-tribe-dark-80'}`}>{copy.forWho}</p>

      <p className="mt-5 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tracking-tighter tabular-nums">{amount ?? c.free}</span>
        <span className={`text-sm font-semibold ${dark ? 'text-tribe-dark-60' : 'text-tribe-dark-80'}`}>
          {amount ? c.perMonth : c.forever}
        </span>
      </p>

      <ul className="mt-6 space-y-3 flex-1">
        {copy.benefits.map((b) => (
          <li key={b} className="flex gap-3 text-[15px] leading-snug">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                dark ? 'bg-tribe-green text-tribe-dark' : 'bg-tribe-green/25 text-tribe-dark'
              }`}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <div className="mt-7">
        {action.kind === 'link' ? (
          <Link href={action.href} className={btn}>
            {c.start}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} disabled={action.disabled} className={btn}>
            {action.busy ? c.working : action.kind === 'manage' ? c.manage : c.start}
          </button>
        )}
      </div>
    </article>
  );
}
