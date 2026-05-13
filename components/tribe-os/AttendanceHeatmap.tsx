'use client';

/**
 * AttendanceHeatmap — last-90-day attendance grid for a single client.
 *
 * GitHub-style cell grid where each cell is one day. Color encodes
 * whether they showed up:
 *   - light gray   = no record
 *   - light green  = attended (paid or unpaid)
 *   - lime green   = attended AND paid
 *
 * Renders 90 cells in a 13×7 grid (13 weeks × 7 days). The newest
 * week sits on the right edge so the eye lands on "what happened
 * recently?" first.
 *
 * Hidden entirely when the client has zero attendance in the
 * window — a brand-new client gets a clean profile.
 *
 * Coaches scanning a member detail get instant visual recall:
 * a sparse left-side / dense right-side patch tells them this
 * member just got into a rhythm. A dense-then-empty pattern
 * tells them this member is falling off. Faster signal than
 * reading the streak number.
 */

import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface AttendanceLite {
  attended: boolean;
  paid: boolean;
  attended_at: string | null;
  session_date: string | null;
}

interface ApiRow {
  attended: boolean;
  paid: boolean;
  attended_at: string | null;
  session?: { date: string | null } | null;
}

type State = { kind: 'loading' } | { kind: 'hidden' } | { kind: 'ready'; rows: AttendanceLite[] };

const DAYS_IN_WINDOW = 90;
const WEEKS = Math.ceil(DAYS_IN_WINDOW / 7); // 13

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Last 90 days',
    hint: 'Each cell is one day. Greens are attended sessions.',
    legendNone: 'No record',
    legendAttended: 'Attended',
    legendPaid: 'Paid',
  },
  es: {
    title: 'Últimos 90 días',
    hint: 'Cada celda es un día. Los verdes son sesiones asistidas.',
    legendNone: 'Sin registro',
    legendAttended: 'Asistió',
    legendPaid: 'Pagó',
  },
} as const;

/**
 * Reduce a list of attendance rows to a "by-day" map. Multiple
 * sessions on the same day collapse to one cell, where paid=true
 * wins over paid=false (best-status semantics).
 */
function buildDayMap(rows: AttendanceLite[]): Map<string, { attended: boolean; paid: boolean }> {
  const map = new Map<string, { attended: boolean; paid: boolean }>();
  for (const r of rows) {
    if (!r.attended) continue;
    // Prefer attended_at; fall back to session.date. Both already
    // come from the API as ISO timestamps / dates.
    const ts = r.attended_at ?? r.session_date;
    if (!ts) continue;
    const key = ts.slice(0, 10); // YYYY-MM-DD in UTC
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { attended: true, paid: r.paid });
    } else if (r.paid && !prev.paid) {
      // Upgrade to paid if any session on that day was paid.
      map.set(key, { attended: true, paid: true });
    }
  }
  return map;
}

/**
 * Compute the date for each cell in column / row order. Newest
 * column is the rightmost; each column is a calendar week.
 */
function buildCellGrid(): Array<{ row: number; col: number; date: Date }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Anchor on this week's Sunday (end of column) so the grid lines
  // up with weekly intuition.
  const cells: Array<{ row: number; col: number; date: Date }> = [];
  for (let col = WEEKS - 1; col >= 0; col -= 1) {
    for (let row = 0; row < 7; row += 1) {
      // Calculate days ago: rightmost column = current week.
      // Within a column, row 0 = Sunday, row 6 = Saturday.
      // Total offset from today:
      //   weeksBack = (WEEKS - 1 - col)
      //   dayOfWeek = today.getUTCDay() — gives 0=Sun..6=Sat
      //   We want this column's calendar position relative to today.
      const weeksBack = WEEKS - 1 - col;
      const todayDow = today.getUTCDay();
      const targetDow = row;
      const daysBack = weeksBack * 7 + (todayDow - targetDow);
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - daysBack);
      cells.push({ row, col, date });
    }
  }
  return cells;
}

export default function AttendanceHeatmap({ clientId }: { clientId: string }) {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/clients/${clientId}/attendance`, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ApiRow[];
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'hidden' });
          return;
        }
        // Filter to the window + project to the lite shape.
        const cutoff = Date.now() - DAYS_IN_WINDOW * 24 * 60 * 60 * 1000;
        const rows: AttendanceLite[] = body.data
          .map((r) => ({
            attended: r.attended,
            paid: r.paid,
            attended_at: r.attended_at,
            session_date: r.session?.date ?? null,
          }))
          .filter((r) => {
            const ts = r.attended_at ?? r.session_date;
            if (!ts) return false;
            return new Date(ts).getTime() >= cutoff;
          });
        // Hide if no attendance in the window. The Stats card already
        // tells the coach "no attendance yet" at the lifecycle level.
        if (rows.filter((r) => r.attended).length === 0) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'ready', rows });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const dayMap = useMemo(() => (state.kind === 'ready' ? buildDayMap(state.rows) : null), [state]);
  const cells = useMemo(() => buildCellGrid(), []);

  if (state.kind !== 'ready' || !dayMap) return null;

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-4 h-4 text-tribe-green-dark" />
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.title}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.hint}</p>

      {/* The grid uses CSS grid with explicit row/col indexing so
          cells stay aligned even on narrow screens. 13 columns × 7
          rows = 91 cells (we render 90; the trailing one is the
          spillover-into-next-week edge cell that day-math sometimes
          produces). Overflow rolls to the right on mobile. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div
          className="inline-grid gap-[3px]"
          style={{
            gridTemplateColumns: `repeat(${WEEKS}, 12px)`,
            gridTemplateRows: 'repeat(7, 12px)',
            gridAutoFlow: 'column',
          }}
          aria-label={s.title}
          role="img"
        >
          {cells.map((cell) => {
            const key = cell.date.toISOString().slice(0, 10);
            const entry = dayMap.get(key);
            // Tiers (lightest → darkest):
            //   no entry          → gray-100
            //   attended unpaid   → tribe-green/30
            //   attended paid     → tribe-green/80
            let cls = 'bg-gray-100';
            if (entry?.attended && entry.paid) cls = 'bg-tribe-green';
            else if (entry?.attended) cls = 'bg-tribe-green/40';
            // Tooltip via title attribute — accessible + lightweight,
            // no JS dropdown to manage.
            const label = entry?.attended
              ? entry.paid
                ? `${key} · ${s.legendPaid}`
                : `${key} · ${s.legendAttended}`
              : `${key} · ${s.legendNone}`;
            return <div key={key} className={`w-3 h-3 rounded-sm ${cls}`} title={label} aria-label={label} />;
          })}
        </div>
      </div>

      {/* Legend — three swatches matching the grid colors so coaches
          can decode the visualization without hovering. */}
      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-gray-100" />
          {s.legendNone}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-tribe-green/40" />
          {s.legendAttended}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm bg-tribe-green" />
          {s.legendPaid}
        </span>
      </div>
    </section>
  );
}
