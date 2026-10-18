import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import br from './bridge.module.css';

/**
 * T-JOIN1 Part A. A day's heading in a list of sessions: the label in Big
 * Shoulders 34px ("Hoy", "Sáb 25"), the count in mono, a 2px rule under.
 */
export default function DayHeader({
  label,
  count,
  headingLevel = 2,
}: {
  label: string;
  /** Already worded: "3 sesiones". */
  count?: string | null;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <div className={`${br.bridge} ${SITE_FONT_CLASS} ${br.day}`}>
      <Heading className={`${br.disp} ${br.dayLabel}`}>{label}</Heading>
      {count && <span className={`${br.mono} ${br.dayCount}`}>{count}</span>}
    </div>
  );
}
