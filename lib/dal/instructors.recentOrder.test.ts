import { describe, it, expect, vi } from 'vitest';

vi.mock('./gymDirectory', () => ({ fetchOrganizationUserIds: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { orderByRecentSessions } from './instructors';

/** T-JOIN1 Part C: the instructor list is ordered by the last 30 days, then newest. Never by admin. */
describe('orderByRecentSessions', () => {
  it('most sessions in the last 30 days first, then the newest account', () => {
    const rows = [
      { id: 'old-busy', created_at: '2025-01-01' },
      { id: 'new-idle', created_at: '2026-10-01' },
      { id: 'old-idle', created_at: '2025-06-01' },
      { id: 'new-busy', created_at: '2026-09-01' },
    ];
    const recent = new Map([
      ['old-busy', 12],
      ['new-busy', 12],
    ]);
    expect(orderByRecentSessions(rows, recent).map((r) => r.id)).toEqual([
      'new-busy',
      'old-busy',
      'new-idle',
      'old-idle',
    ]);
  });

  it('does not mutate its input', () => {
    const rows = [
      { id: 'a', created_at: '2025-01-01' },
      { id: 'b', created_at: '2026-01-01' },
    ];
    orderByRecentSessions(rows, new Map());
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
