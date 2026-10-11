import { describe, it, expect } from 'vitest';
import { computeTouchOutcome, computeTouchOutcomes, type TouchRow, type VisitRow } from './touch-outcome';

const NOW = new Date('2026-10-10T12:00:00Z');

function makeTouch(overrides: Partial<TouchRow> & { id?: string } = {}): TouchRow {
  return {
    id: 't1',
    client_id: 'c1',
    created_at: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}

function makeVisit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    client_id: 'c1',
    visited_at: '2026-10-05T14:00:00Z',
    ...overrides,
  };
}

describe('computeTouchOutcome', () => {
  it('returns came_back when visit within 14 days', () => {
    const touch = makeTouch({ created_at: '2026-10-01T12:00:00Z' });
    const visits = [makeVisit({ visited_at: '2026-10-05T14:00:00Z' })];
    const result = computeTouchOutcome(touch, visits, NOW);
    expect(result.kind).toBe('came_back');
    if (result.kind === 'came_back') {
      expect(result.days).toBe(5);
    }
  });

  it('returns waiting when touch is under 14 days old with no visit', () => {
    const touch = makeTouch({ created_at: '2026-10-05T12:00:00Z' });
    const result = computeTouchOutcome(touch, [], NOW);
    expect(result.kind).toBe('waiting');
  });

  it('returns no_response when 14+ days and no visit', () => {
    const touch = makeTouch({ created_at: '2026-09-20T12:00:00Z' });
    const result = computeTouchOutcome(touch, [], NOW);
    expect(result.kind).toBe('no_response');
  });

  it('ignores visits before the touch', () => {
    const touch = makeTouch({ created_at: '2026-10-05T12:00:00Z' });
    const visits = [makeVisit({ visited_at: '2026-10-01T14:00:00Z' })];
    const result = computeTouchOutcome(touch, visits, NOW);
    expect(result.kind).toBe('waiting');
  });

  it('ignores visits more than 14 days after the touch', () => {
    const touch = makeTouch({ created_at: '2026-09-01T12:00:00Z' });
    const visits = [makeVisit({ visited_at: '2026-09-20T14:00:00Z' })];
    const result = computeTouchOutcome(touch, visits, NOW);
    expect(result.kind).toBe('no_response');
  });

  it('ignores visits for a different client', () => {
    const touch = makeTouch({ client_id: 'c1', created_at: '2026-09-20T12:00:00Z' });
    const visits = [makeVisit({ client_id: 'c2', visited_at: '2026-09-25T14:00:00Z' })];
    const result = computeTouchOutcome(touch, visits, NOW);
    expect(result.kind).toBe('no_response');
  });
});

describe('computeTouchOutcomes', () => {
  it('assigns outcome to each touch', () => {
    const touches = [
      makeTouch({ id: 't1', client_id: 'c1', created_at: '2026-10-01T12:00:00Z' }),
      makeTouch({ id: 't2', client_id: 'c2', created_at: '2026-10-05T12:00:00Z' }),
    ];
    const visits = [makeVisit({ client_id: 'c1', visited_at: '2026-10-04T14:00:00Z' })];
    const results = computeTouchOutcomes(touches, visits, NOW);
    expect(results.get('t1')?.kind).toBe('came_back');
    expect(results.get('t2')?.kind).toBe('waiting');
  });

  it('attributes visit to most recent touch before it (multiple touches same member)', () => {
    const touches = [
      makeTouch({ id: 't1', client_id: 'c1', created_at: '2026-09-25T12:00:00Z' }),
      makeTouch({ id: 't2', client_id: 'c1', created_at: '2026-10-01T12:00:00Z' }),
    ];
    const visits = [makeVisit({ client_id: 'c1', visited_at: '2026-10-05T14:00:00Z' })];
    const results = computeTouchOutcomes(touches, visits, NOW);
    expect(results.get('t2')?.kind).toBe('came_back');
    expect(results.get('t1')?.kind).toBe('no_response');
  });

  it('handles multiple touches and visits for same member correctly', () => {
    const touches = [
      makeTouch({ id: 't1', client_id: 'c1', created_at: '2026-09-20T12:00:00Z' }),
      makeTouch({ id: 't2', client_id: 'c1', created_at: '2026-09-28T12:00:00Z' }),
      makeTouch({ id: 't3', client_id: 'c1', created_at: '2026-10-05T12:00:00Z' }),
    ];
    const visits = [
      makeVisit({ client_id: 'c1', visited_at: '2026-09-22T14:00:00Z' }),
      makeVisit({ client_id: 'c1', visited_at: '2026-10-02T14:00:00Z' }),
    ];
    const results = computeTouchOutcomes(touches, visits, NOW);
    expect(results.get('t1')?.kind).toBe('came_back');
    expect(results.get('t2')?.kind).toBe('came_back');
    expect(results.get('t3')?.kind).toBe('waiting');
  });
});
