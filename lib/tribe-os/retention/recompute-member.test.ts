import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recomputeMemberRetention } from './recompute-member';

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    member: { joined_on: '2026-06-01', plan_ends_on: '2026-11-01' },
    memberErr: null,
    activities: [{ activity_at: new Date().toISOString() }],
    actErr: null,
    upsertErr: null,
    insights: [],
    insightErr: null,
    resolveErr: null,
  };
  const cfg = { ...defaults, ...overrides };

  const insightUpdate = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ error: cfg.resolveErr }),
  });

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: cfg.member, error: cfg.memberErr }),
              }),
            }),
          }),
        };
      }
      if (table === 'client_activity_v2') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: cfg.activities, error: cfg.actErr }),
              }),
            }),
          }),
        };
      }
      if (table === 'client_retention_v2') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: cfg.upsertErr }),
        };
      }
      if (table === 'community_insight_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: cfg.insights, error: cfg.insightErr }),
              }),
            }),
          }),
        };
      }
      if (table === 'community_insights') {
        return { update: insightUpdate };
      }
      return {};
    }),
  };

  return { supabase: supabase as unknown as Parameters<typeof recomputeMemberRetention>[0], insightUpdate };
}

describe('recomputeMemberRetention', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok with score and level on success', async () => {
    const { supabase } = mockSupabase();
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(true);
    expect(result.score).toEqual(expect.any(Number));
    expect(result.level).toBeTruthy();
  });

  it('returns ok:false when member lookup fails', async () => {
    const { supabase } = mockSupabase({ memberErr: { message: 'not found' }, member: null });
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('member_lookup_failed');
  });

  it('returns ok:false when activities fetch fails', async () => {
    const { supabase } = mockSupabase({ actErr: { message: 'view error' } });
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('activities_fetch_failed');
  });

  it('returns ok:false when retention upsert fails', async () => {
    const { supabase } = mockSupabase({ upsertErr: { message: 'rls denied' } });
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('retention_upsert_failed');
  });

  it('resolves CHURN_RISK insights when level drops to low', async () => {
    const { supabase, insightUpdate } = mockSupabase({
      activities: [{ activity_at: new Date().toISOString() }],
      insights: [{ insight: { id: 'ins1', type: 'CHURN_RISK', is_actioned: false } }],
    });
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(true);
    expect(result.level).toBe('low');
    expect(insightUpdate).toHaveBeenCalled();
  });

  it('still returns ok when insight resolution fails', async () => {
    const { supabase } = mockSupabase({
      activities: [{ activity_at: new Date().toISOString() }],
      insights: [{ insight: { id: 'ins1', type: 'CHURN_RISK', is_actioned: false } }],
      resolveErr: { message: 'rls denied' },
    });
    const result = await recomputeMemberRetention(supabase, 'gym1', 'client1', 'test');
    expect(result.ok).toBe(true);
  });
});
