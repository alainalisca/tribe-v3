import type { ReactNode } from 'react';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import br from './bridge.module.css';

/**
 * T-JOIN1 Part A. A session's facts as a ledger: a mono uppercase label in a
 * 72px column (Cuándo, Dónde, Cuánto, Quién), the value, and an optional line
 * under it. Hairline rules between rows, no card border.
 */
export type Fact = { label: string; value: ReactNode; sub?: ReactNode };

export default function FactsLedger({ facts }: { facts: Fact[] }) {
  return (
    <dl className={`${br.bridge} ${SITE_FONT_CLASS} ${br.ledger}`}>
      {facts.map((f) => (
        <div key={f.label} className={br.fact}>
          <dt className={`${br.mono} ${br.factLabel}`}>{f.label}</dt>
          <dd className={br.factValue}>
            {f.value}
            {f.sub && <span className={br.factSub}>{f.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
