/**
 * The Monday weekly summary must not email a gym that has nothing to report.
 *
 * Without the gate it still sends, reading "No attendance recorded this week.
 * If that's a surprise, head to /os/dashboard to investigate." with revenue as
 * an em dash — a weekly nag for an idle gym, and a brand-new customer's likely
 * first impression.
 *
 * The gate deliberately checks at-risk clients and active insights too, not
 * just attendance: those are CURRENT state, not window state, so a gym with no
 * sessions this week but clients drifting toward churn genuinely does have
 * something worth reading.
 *
 * These call the real maybeSendWeeklySummary. A test that re-implements the
 * predicate would pass even if the gate were deleted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendWeeklySummary = vi.fn();

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('./weeklySummary', () => ({ sendWeeklySummary: mockSendWeeklySummary }));

/** Counts to hand back for the two head:true count queries (at-risk, insights). */
let atRiskCount = 0;
let insightsCount = 0;
/** client_attendance rows for the window. */
let attendanceRows: unknown[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = (_c?: unknown, opts?: { head?: boolean }) => {
        if (opts?.head) {
          // Count query: resolve with the configured count.
          const counted = {
            eq: () => counted,
            then: (resolve: (v: unknown) => void) =>
              resolve({ count: table === 'clients' ? atRiskCount : insightsCount, error: null }),
            gt: () => counted,
          };
          return counted;
        }
        return chain;
      };
      chain.eq = self;
      chain.gte = self;
      chain.lt = self;
      chain.gt = self;
      chain.single = () =>
        Promise.resolve({
          data: { name: 'Test Gym', owner_user_id: 'owner-1', intelligence_email_enabled: true },
          error: null,
        });
      chain.maybeSingle = () =>
        Promise.resolve({
          data:
            table === 'gyms'
              ? { name: 'Test Gym', owner_user_id: 'owner-1', intelligence_email_enabled: true }
              : { name: 'Owner', email: 'owner@example.com', preferred_language: 'en' },
          error: null,
        });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: attendanceRows, error: null });
      return chain;
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  process.env.RESEND_API_KEY = 'test-resend';
  atRiskCount = 0;
  insightsCount = 0;
  attendanceRows = [];
});

async function run() {
  const { maybeSendWeeklySummary } = await import('./weeklySummarySender');
  return maybeSendWeeklySummary('gym-1', 'https://tribe-v3.vercel.app');
}

describe('no_activity gate', () => {
  it('SKIPS a completely idle week and sends no email', async () => {
    const result = await run();

    expect(result.sent).toBe(false);
    expect(result.skip_reason).toBe('no_activity');
    expect(mockSendWeeklySummary).not.toHaveBeenCalled();
  });

  it('SENDS when clients are at risk even with zero sessions — the most useful email', async () => {
    atRiskCount = 3;

    const result = await run();

    expect(result.skip_reason).not.toBe('no_activity');
    expect(mockSendWeeklySummary).toHaveBeenCalled();
  });

  it('SENDS when there are open insights even with zero sessions', async () => {
    insightsCount = 2;

    const result = await run();

    expect(result.skip_reason).not.toBe('no_activity');
    expect(mockSendWeeklySummary).toHaveBeenCalled();
  });
});
