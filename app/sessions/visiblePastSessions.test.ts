import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { visiblePastSessions } from './useSessionsData';

/** Historial leaves out cancelled test sessions, and only those (T-POLISH1). */
describe('visiblePastSessions', () => {
  it('drops a cancelled is_test session, keeps the rest', () => {
    const list = [
      { id: 'a', status: 'cancelled', is_test: true },
      { id: 'b', status: 'cancelled', is_test: false },
      { id: 'c', status: 'active', is_test: true },
      { id: 'd', status: 'active', is_test: false },
    ];
    expect(visiblePastSessions(list).map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });
});
