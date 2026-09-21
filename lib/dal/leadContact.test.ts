/**
 * setPassLeadContacted: the only write either leads view can make (T-LEAD2).
 *
 * WHAT A MOCK CAN AND CANNOT SEE HERE, because this function's most important
 * properties are not in this file.
 *
 * That the writable surface is one column, that a stranger is refused, that a
 * re-mark preserves the original timestamp -- all of those live inside
 * set_pass_lead_contacted, in the database, and are proved by migration 175's
 * guards and by its production rehearsal. A test with a mocked client cannot
 * reach any of them, and one written to look like it does would be asserting
 * on the value the test handed back to itself.
 *
 * What this file covers is the half the DAL owns: that it calls the RPC rather
 * than reaching for a table update that would be refused, that it names the
 * parameters the function actually declares, that it renders what the DATABASE
 * returned rather than what the caller asked for, and that a refusal surfaces
 * as a failure instead of as a successful no-op. The last of those is the one
 * that matters in the product: a toggle that reports success and then flips
 * back on the next reload reads as a flaky app rather than as a refusal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { setPassLeadContacted } from './leadContact';
import { logError } from '@/lib/logger';

const LEAD_ID = '7f4f1f8e-0a1a-4a2b-9c3d-000000000001';
const STAMP = '2026-09-20T18:04:11.921Z';

function client(answer: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: answer.data ?? null, error: answer.error ?? null });
  return { client: { rpc } as never, rpc };
}

beforeEach(() => vi.clearAllMocks());

describe('how the write is made', () => {
  it('goes through the RPC, not a table update', async () => {
    const { client: c, rpc } = client({ data: STAMP });
    const from = vi.fn();
    (c as unknown as { from: unknown }).from = from;

    await setPassLeadContacted(c, LEAD_ID, true);

    expect(rpc).toHaveBeenCalledTimes(1);
    // `authenticated` holds UPDATE on no column of pass_leads, so a table
    // update is a 42501 for an admin and a partner alike. If this ever starts
    // touching the table directly, the toggle is dead everywhere and the only
    // symptom is a toast.
    expect(from).not.toHaveBeenCalled();
  });

  it('calls the function by the name and parameters migration 175 declares', async () => {
    const { client: c, rpc } = client({ data: STAMP });

    await setPassLeadContacted(c, LEAD_ID, true);

    // PostgREST resolves a function by its argument NAMES. A renamed parameter
    // is a PGRST202 "function not found" at runtime and nothing at build time,
    // so the names are pinned here against the migration.
    expect(rpc).toHaveBeenCalledWith('set_pass_lead_contacted', {
      p_lead_id: LEAD_ID,
      p_contacted: true,
    });
  });

  it('passes the requested state through rather than always marking', async () => {
    const { client: c, rpc } = client({ data: null });

    await setPassLeadContacted(c, LEAD_ID, false);

    expect(rpc.mock.calls[0][1]).toMatchObject({ p_contacted: false });
  });
});

describe('what the caller is told', () => {
  it('returns the timestamp the database decided, not the one we asked for', async () => {
    // The function coalesces, so re-marking an already-contacted lead returns
    // the ORIGINAL stamp. A DAL that echoed the request would show a moved
    // timestamp that is not in the row.
    const { client: c } = client({ data: STAMP });

    const result = await setPassLeadContacted(c, LEAD_ID, true);

    expect(result.success).toBe(true);
    expect(result.data).toBe(STAMP);
  });

  it('returns null when the lead was cleared', async () => {
    const { client: c } = client({ data: null });

    const result = await setPassLeadContacted(c, LEAD_ID, false);

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
  });
});

describe('a refusal', () => {
  it('fails rather than reporting a successful no-op', async () => {
    const { client: c } = client({
      error: { message: 'set_pass_lead_contacted: caller may not modify lead ' + LEAD_ID },
    });

    const result = await setPassLeadContacted(c, LEAD_ID, true);

    // The whole reason the function raises instead of updating zero rows. If
    // this reported success, the toggle would flip on, the reload would flip
    // it back, and nobody would be told why.
    expect(result.success).toBe(false);
  });

  it('records WHY, carrying the database reason into the log', async () => {
    const { client: c } = client({ error: { message: 'permission denied' } });

    await setPassLeadContacted(c, LEAD_ID, true);

    // Asserting only on success:false cannot tell correct handling apart from
    // no handling at all: delete the `if (error)` branch and the function
    // returns success:true, but a thrown error would land in the catch and
    // ALSO produce success:false. Asserting that the failure was RECOGNISED,
    // with the reason attached, is the thing that differs.
    expect(logError).toHaveBeenCalledTimes(1);
    const [reason, context] = vi.mocked(logError).mock.calls[0];
    expect((reason as { message: string }).message).toBe('permission denied');
    expect(context).toMatchObject({ action: 'setPassLeadContacted', passLeadId: LEAD_ID });
  });

  it('survives a client that throws rather than returning an error', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));
    const c = { rpc } as never;

    const result = await setPassLeadContacted(c, LEAD_ID, true);

    expect(result.success).toBe(false);
    // A user-facing sentence, not the exception text.
    expect(result.error).toBe('Failed to update the lead');
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('does not log a successful write', async () => {
    const { client: c } = client({ data: STAMP });

    await setPassLeadContacted(c, LEAD_ID, true);

    expect(logError).not.toHaveBeenCalled();
  });
});
