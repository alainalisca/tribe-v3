import { describe, it, expect, vi } from 'vitest';
import { deliverSessionMoments, planDelivery } from './deliver';

describe('Entregar (T-MOM1)', () => {
  it('counts per person and per invite, never per photo', () => {
    const plan = planDelivery([
      { id: 't1', media_id: 'm1', user_id: 'ana', invite_id: null },
      { id: 't2', media_id: 'm2', user_id: 'ana', invite_id: null },
      { id: 't3', media_id: 'm2', user_id: 'juan', invite_id: null },
      { id: 't4', media_id: 'm3', user_id: null, invite_id: 'i1' },
    ]);
    expect([...plan.perUser]).toEqual([
      ['ana', 2],
      ['juan', 1],
    ]);
    expect([...plan.perInvite]).toEqual([['i1', 1]]);
    expect(plan.photos).toBe(3);
  });

  it('a batch sends ONE notification per tagged person, after marking the tags delivered', async () => {
    const calls: string[] = [];
    const service = {
      from: (table: string) => {
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, { select: chain, eq: chain, is: chain, in: chain });
        if (table === 'session_media')
          Object.assign(q, {
            then: (r: (v: unknown) => void) => r({ data: [{ id: 'm1' }, { id: 'm2' }], error: null }),
          });
        if (table === 'session_media_tags') {
          Object.assign(q, {
            then: (r: (v: unknown) => void) =>
              r({
                data: [
                  { id: 't1', media_id: 'm1', user_id: 'ana', invite_id: null },
                  { id: 't2', media_id: 'm2', user_id: 'ana', invite_id: null },
                  { id: 't3', media_id: 'm2', user_id: 'juan', invite_id: null },
                ],
                error: null,
              }),
            update: () => {
              calls.push('update');
              return { in: async () => ({ error: null }) };
            },
          });
        }
        return q;
      },
    };
    const notify = vi.fn(async (userId: string, count: number) => {
      calls.push(`notify ${userId} ${count}`);
    });
    const result = await deliverSessionMoments(service as never, 's1', notify);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['update', 'notify ana 2', 'notify juan 1']);
    expect(result).toEqual({ photos: 2, people: 2, invites: [] });
  });
});
