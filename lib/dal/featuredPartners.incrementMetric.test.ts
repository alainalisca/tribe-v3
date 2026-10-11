/**
 * T-PARTNER-METRIC1: incrementPartnerMetric calls the narrow, whitelisted
 * increment_partner_metric (migration 217), never a generic incrementer.
 *
 * The old call, rpc('increment_counter', {table_name, row_id, column_name}),
 * named a function that was never created: every banner impression and click
 * since April was lost and logged as error_occurred on each home load. The
 * shape itself was the danger -- a (table, column, row) incrementer callable by
 * anon -- so the last case keeps it from coming back anywhere in the code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

const logError = vi.fn();
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => logError(...a) }));

import { incrementPartnerMetric } from './featuredPartners';

const rpc = vi.fn();
const supabase = { rpc } as unknown as SupabaseClient;

beforeEach(() => vi.clearAllMocks());

describe('incrementPartnerMetric', () => {
  it.each(['total_impressions', 'total_clicks'] as const)('%s goes to increment_partner_metric', async (metric) => {
    rpc.mockResolvedValue({ error: null });
    expect(await incrementPartnerMetric(supabase, 'p1', metric)).toEqual({ success: true, data: null });
    expect(rpc).toHaveBeenCalledWith('increment_partner_metric', { p_partner_id: 'p1', p_metric: metric });
  });

  it('logs and reports a failure instead of swallowing it', async () => {
    rpc.mockResolvedValue({ error: { message: 'boom', code: 'PGRST202' } });
    const r = await incrementPartnerMetric(supabase, 'p1', 'total_clicks');
    expect(r).toEqual({ success: false, error: 'boom' });
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({ action: 'incrementPartnerMetric', partnerId: 'p1', metric: 'total_clicks' })
    );
  });

  it('total_bookings is not a client metric (compile-time)', () => {
    // tsc enforces this line: if total_bookings ever becomes a PartnerMetric
    // again, the directive itself is the compile error.
    // @ts-expect-error -- bookings are derived server-side, never bumped by a page load
    void (() => incrementPartnerMetric(supabase, 'p1', 'total_bookings'));
    expect(true).toBe(true);
  });
});

describe('no generic incrementer is called anywhere', () => {
  const ROOT = join(__dirname, '..', '..');
  const SKIP = new Set(['node_modules', '.next', '.git', '.claude', '.worktrees', 'docs', 'supabase', 'scripts']);

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, acc);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(full);
    }
    return acc;
  }

  it('reads the source tree (the check below is about something)', () => {
    expect(sourceFiles(ROOT).length).toBeGreaterThan(100);
  });

  it("no source file calls rpc('increment_counter') or another table-generic incrementer", () => {
    const offenders = sourceFiles(ROOT).filter((f) =>
      /\.rpc\(\s*['"`](increment_counter|increment_column|increment)['"`]/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });
});
