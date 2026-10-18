import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/dal', () => ({ createNotification: vi.fn(async () => ({ success: true, data: null })) }));

import { createNotification } from '@/lib/dal';
import { notifyHostOfGuest } from './notifyHost';

/** T-JOIN1 Part B: the host learns of a guest request from the server. */
function service(session: Record<string, unknown> | null, lang = 'es') {
  return {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'sessions' ? session : { preferred_language: lang } }),
        }),
      }),
    })),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 }))
  );
});

describe('notifyHostOfGuest', () => {
  it("puts a session_join notification in the host's bell, in the host's language", async () => {
    await notifyHostOfGuest(service({ creator_id: 'host-1', sport: 'Yoga', status: 'active' }), 's1', 'Ana');
    expect(createNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipient_id: 'host-1',
        actor_id: null,
        type: 'session_join',
        entity_id: 's1',
        message: expect.stringContaining('Ana'),
      })
    );
  });

  it('does nothing for a session that is not active', async () => {
    await notifyHostOfGuest(service({ creator_id: 'host-1', sport: 'Yoga', status: 'cancelled' }), 's1', 'Ana');
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('never throws, so a failed ping cannot fail the join', async () => {
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('db down'));
    await expect(
      notifyHostOfGuest(service({ creator_id: 'host-1', sport: 'Yoga', status: 'active' }), 's1', 'Ana')
    ).resolves.toBeUndefined();
  });
});
