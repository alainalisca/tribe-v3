import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for checkInstructorUpsellEligibility.
 *
 * InstructorUpsellBanner is the only in-app invitation for an athlete to
 * become an instructor. The gate used to require 3 or more hosted sessions
 * plus a 4.0 average host rating, which nobody on the live database cleared
 * (0 of 72 non-instructors on 2026-09-06), so the invitation never appeared.
 *
 * The rule is now simply: any signed-in user who is not already an instructor
 * is eligible. These tests pin that, and pin that the function still refuses
 * when the users row cannot be read.
 */

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { checkInstructorUpsellEligibility } from './instructors';

type UserRow = { is_instructor: boolean } | null;

function mockSupabase(result: { data: UserRow; error: { message: string } | null }) {
  const single = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  // Typed parameter so the recorded call tuple is inspectable below.
  const from = vi.fn((_table: string) => ({ select }));
  return { client: { from } as never, from, select, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkInstructorUpsellEligibility', () => {
  it('is eligible for a non-instructor with zero sessions and zero reviews', async () => {
    const { client } = mockSupabase({ data: { is_instructor: false }, error: null });

    const result = await checkInstructorUpsellEligibility(client, 'u1');

    expect(result.success).toBe(true);
    expect(result.data?.eligible).toBe(true);
  });

  it('is NOT eligible for someone who is already an instructor', async () => {
    const { client } = mockSupabase({ data: { is_instructor: true }, error: null });

    const result = await checkInstructorUpsellEligibility(client, 'u2');

    expect(result.success).toBe(true);
    expect(result.data?.eligible).toBe(false);
  });

  it('never queries sessions or reviews: the users row is the only input', async () => {
    const { client, from } = mockSupabase({ data: { is_instructor: false }, error: null });

    await checkInstructorUpsellEligibility(client, 'u3');

    const tables = from.mock.calls.map((call) => call[0]);
    expect(tables).toEqual(['users']);
    expect(tables).not.toContain('sessions');
    expect(tables).not.toContain('reviews');
  });

  it('fails closed when the users row cannot be read', async () => {
    const { client } = mockSupabase({ data: null, error: { message: 'permission denied' } });

    const result = await checkInstructorUpsellEligibility(client, 'u4');

    expect(result.success).toBe(false);
    // The banner hides on a failed result, so a read error must not read as eligible.
    expect(result.data?.eligible).toBeUndefined();
  });

  it('is not eligible when the row is missing entirely', async () => {
    const { client } = mockSupabase({ data: null, error: null });

    const result = await checkInstructorUpsellEligibility(client, 'u5');

    expect(result.success).toBe(true);
    expect(result.data?.eligible).toBe(false);
  });
});
