import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchTribeBrought } from './tribeBrought';
import { logError } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

function rpcClient(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const BODY = {
  success: true,
  month: '2030-05',
  contacts: { count: 4, names: ['Ana', 'Carla', 'Eva', 'Feli'] },
  first_visits: { count: 3, names: ['Ana', 'Eva', 'Feli'] },
  came_back: { count: 2, names: ['Ana', 'Feli'] },
};

beforeEach(() => vi.mocked(logError).mockClear());

describe('fetchTribeBrought', () => {
  it('reads the one definer function and maps its three groups', async () => {
    const m = rpcClient({ data: BODY, error: null });
    const res = await fetchTribeBrought(m.client);
    expect(m.rpc).toHaveBeenCalledWith('av_coach_tribe_brought', {});
    expect(res.data).toEqual({
      month: '2030-05',
      contacts: { count: 4, names: ['Ana', 'Carla', 'Eva', 'Feli'] },
      firstVisits: { count: 3, names: ['Ana', 'Eva', 'Feli'] },
      cameBack: { count: 2, names: ['Ana', 'Feli'] },
    });
  });

  it('drops empty names (a user with no name) but keeps the count', async () => {
    const m = rpcClient({ data: { ...BODY, contacts: { count: 2, names: ['Ana', ''] } }, error: null });
    expect((await fetchTribeBrought(m.client)).data?.contacts).toEqual({ count: 2, names: ['Ana'] });
  });

  it('a refusal (not an instructor) is a failure with its reason', async () => {
    const m = rpcClient({ data: { success: false, error: 'not_instructor' }, error: null });
    expect(await fetchTribeBrought(m.client)).toEqual({ success: false, error: 'not_instructor' });
  });

  it('recognises an unexpected shape instead of rendering zeros', async () => {
    const m = rpcClient({ data: { success: true, month: '2030-05', contacts: { count: 1 } }, error: null });
    const res = await fetchTribeBrought(m.client);
    expect(res).toEqual({ success: false, error: 'bad_shape' });
    expect(logError).toHaveBeenCalled();
  });

  it('recognises a transport error and logs it', async () => {
    const m = rpcClient({ data: null, error: { message: 'boom' } });
    expect((await fetchTribeBrought(m.client)).success).toBe(false);
    expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), {
      action: 'fetchTribeBrought',
    });
  });
});
