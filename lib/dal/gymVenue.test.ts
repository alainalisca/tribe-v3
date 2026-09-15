import { describe, it, expect, vi } from 'vitest';
import { fetchPartnersByIds, fetchPartnersForInstructors, setSessionPartner, reviewVenueRequest } from './gymVenue';

const ACTIVE = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
};
const EXPIRED = { ...ACTIVE, id: 'p2', business_name: 'Expired Gym', status: 'expired' };

/** Minimal PostgREST double: records the calls, returns a fixed payload. */
function clientReturning(payload: unknown, spy?: { calls: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'in', 'eq', 'order', 'limit', 'ilike']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: payload, error: null });
  return {
    from: vi.fn(() => {
      if (spy) spy.calls += 1;
      return builder;
    }),
    rpc: vi.fn().mockResolvedValue({ data: 'pending', error: null }),
  } as never;
}

describe('fetchPartnersByIds', () => {
  it('issues no query at all for an empty page', async () => {
    const spy = { calls: 0 };
    const result = await fetchPartnersByIds(clientReturning([], spy), []);
    expect(spy.calls).toBe(0);
    expect(result.data?.size).toBe(0);
  });

  it('is one query for the whole page, not one per session', async () => {
    const spy = { calls: 0 };
    await fetchPartnersByIds(clientReturning([ACTIVE], spy), ['p1', 'p1', 'p1', 'p1']);
    expect(spy.calls).toBe(1);
  });

  it('drops partners that are not active', async () => {
    // Testing note 4: set status to expired and the gym identity disappears
    // while the session still renders.
    const result = await fetchPartnersByIds(clientReturning([ACTIVE, EXPIRED]), ['p1', 'p2']);
    expect(result.data?.has('p1')).toBe(true);
    expect(result.data?.has('p2')).toBe(false);
  });
});

describe('fetchPartnersForInstructors', () => {
  it('is one query for every creator on the page', async () => {
    const spy = { calls: 0 };
    await fetchPartnersForInstructors(clientReturning([{ instructor_id: 'i1', partner: ACTIVE }], spy), [
      'i1',
      'i2',
      'i3',
    ]);
    expect(spy.calls).toBe(1);
  });

  it('keys affiliations by instructor', async () => {
    const result = await fetchPartnersForInstructors(
      clientReturning([
        { instructor_id: 'i1', partner: ACTIVE },
        { instructor_id: 'i2', partner: EXPIRED },
      ]),
      ['i1', 'i2']
    );
    expect(result.data?.get('i1')?.business_name).toBe('CrossFit BullBox');
    // An expired partner lends no identity, so i2 gets no affiliation tag.
    expect(result.data?.get('i2')).toBeUndefined();
  });

  it('keeps the first active roster when an instructor is on two', async () => {
    const other = { ...ACTIVE, id: 'p3', business_name: 'Second Gym' };
    const result = await fetchPartnersForInstructors(
      clientReturning([
        { instructor_id: 'i1', partner: ACTIVE },
        { instructor_id: 'i1', partner: other },
      ]),
      ['i1']
    );
    expect(result.data?.get('i1')?.id).toBe('p1');
  });
});

describe('the verdict never leaves the database', () => {
  it('setSessionPartner sends no status, only the venue', async () => {
    const client = clientReturning([]);
    await setSessionPartner(client, 's1', 'p1');
    const args = (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0];
    expect(args[0]).toBe('set_session_partner');
    expect(args[1]).toEqual({ p_session_id: 's1', p_partner_id: 'p1' });
    expect(JSON.stringify(args[1])).not.toContain('approved');
  });

  it('clears the venue by passing null rather than writing the columns', async () => {
    const client = clientReturning([]);
    await setSessionPartner(client, 's1', null);
    const args = (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc.mock.calls[0];
    expect(args[1]).toEqual({ p_session_id: 's1', p_partner_id: null });
  });

  it('reviewVenueRequest goes through the RPC, never a table update', async () => {
    // A direct .update() would be refused by the column privileges from 158,
    // so routing this through the RPC is the only path that works at all.
    const client = clientReturning([]);
    await reviewVenueRequest(client, 's1', 'approved');
    const rpc = (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc.mock.calls[0][0]).toBe('review_venue_request');
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
