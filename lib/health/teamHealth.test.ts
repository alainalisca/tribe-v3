import { describe, it, expect } from 'vitest';
import { classifyHealth, bucketCounts } from './teamHealth';

/**
 * The classifier feeds both /os/members and /os/teams. Drift between
 * them was the original motivator for centralizing the rules here,
 * so the tests assert each precedence step.
 */

describe('classifyHealth precedence', () => {
  const baseRow = {
    status: 'active' as string | null,
    health_status: null as string | null,
    last_seen_at: new Date().toISOString(),
  };

  it('AI AT_RISK beats everything else', () => {
    expect(classifyHealth({ ...baseRow, health_status: 'AT_RISK' })).toBe('at_risk');
    // Even when AI says at-risk and manual status would suggest watch,
    // AI wins.
    expect(classifyHealth({ ...baseRow, health_status: 'AT_RISK', status: 'lapsed' })).toBe('at_risk');
  });

  it('AI WATCH beats manual lapsed + heuristic', () => {
    expect(classifyHealth({ ...baseRow, health_status: 'WATCH' })).toBe('watch');
  });

  it('manual lapsed → watch when AI has no opinion', () => {
    expect(classifyHealth({ ...baseRow, status: 'lapsed', health_status: null })).toBe('watch');
  });

  it('heuristic: active + no recent attendance → at_risk', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyHealth({ status: 'active', health_status: null, last_seen_at: fifteenDaysAgo })).toBe('at_risk');
  });

  it('heuristic: active + no attendance ever → at_risk', () => {
    expect(classifyHealth({ status: 'active', health_status: null, last_seen_at: null })).toBe('at_risk');
  });

  it('default: active + recent attendance → healthy', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyHealth({ status: 'active', health_status: null, last_seen_at: twoDaysAgo })).toBe('healthy');
  });

  it('excludes leads from health math', () => {
    expect(classifyHealth({ status: 'lead', health_status: null, last_seen_at: null })).toBeNull();
  });

  it('excludes inactive clients from health math', () => {
    expect(classifyHealth({ status: 'inactive', health_status: null, last_seen_at: null })).toBeNull();
  });

  it('HEALTHY AI label maps to healthy for active clients', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(classifyHealth({ status: 'active', health_status: 'HEALTHY', last_seen_at: twoDaysAgo })).toBe('healthy');
  });
});

describe('bucketCounts', () => {
  it('aggregates a mixed roster correctly', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const eighteenDaysAgo = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString();
    const counts = bucketCounts([
      // 2 healthy
      { status: 'active', health_status: null, last_seen_at: twoDaysAgo },
      { status: 'active', health_status: 'HEALTHY', last_seen_at: twoDaysAgo },
      // 1 watch (AI)
      { status: 'active', health_status: 'WATCH', last_seen_at: twoDaysAgo },
      // 1 watch (manual lapsed)
      { status: 'lapsed', health_status: null, last_seen_at: eighteenDaysAgo },
      // 2 at_risk
      { status: 'active', health_status: 'AT_RISK', last_seen_at: twoDaysAgo },
      { status: 'active', health_status: null, last_seen_at: eighteenDaysAgo },
      // dropped from math (lead)
      { status: 'lead', health_status: null, last_seen_at: null },
    ]);
    expect(counts).toEqual({ healthy: 2, watch: 2, at_risk: 2 });
  });

  it('returns all zeros for empty input', () => {
    expect(bucketCounts([])).toEqual({ healthy: 0, watch: 0, at_risk: 0 });
  });

  it('returns all zeros when every row is excluded (all leads)', () => {
    expect(
      bucketCounts([
        { status: 'lead', health_status: null, last_seen_at: null },
        { status: 'lead', health_status: null, last_seen_at: null },
      ])
    ).toEqual({ healthy: 0, watch: 0, at_risk: 0 });
  });
});
