/**
 * Issue 1 (Ronald Gallego's onboarding): the sport filter on /instructors
 * matched against `users.specialties`, which is free text an instructor types
 * themselves. A chip therefore only matched when the instructor happened to
 * spell the sport exactly the way the chip did -- "Crossfit" and "yoga" both
 * missed. Measured on production before the fix: 4 of 15 discoverable
 * instructors were reachable by any chip; after, 11.
 *
 * The filter now reads `users.sports`, the canonical vocabulary from
 * lib/sports.ts. `specialties` survives as free text and stays SEARCHABLE, but
 * nothing filters on it any more. These tests pin that split, because the
 * bug is silent: filtering the wrong column returns an empty list, which is
 * indistinguishable from "no instructor teaches this sport".
 */
import { describe, it, expect, vi } from 'vitest';

const orgIds = vi.fn();
vi.mock('./gymDirectory', () => ({ fetchOrganizationUserIds: (...args: unknown[]) => orgIds(...args) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/avatar', () => ({ resolveAvatarUrl: (a: string | null) => a }));

import { fetchInstructors } from './instructors';

/**
 * fetchInstructors drops rows that fail the T-PROF1 completeness filter before
 * it maps them, so a fixture missing photo/bio/location/years never reaches the
 * assertions. Fill the five required fields and override only what a test cares
 * about.
 */
function complete(over: Record<string, unknown>): Record<string, unknown> {
  return {
    avatar_url: 'a.jpg',
    bio: 'a bio',
    specialties: ['Coach'],
    location: 'Medellin',
    years_experience: 5,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function client(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'contains', 'ilike', 'order', 'limit', 'not']) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    });
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  return { client: { from: vi.fn(() => builder) } as never, calls };
}

describe('fetchInstructors filters on the canonical sports column', () => {
  it('sends the sport to `sports`, not to `specialties`', async () => {
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c, { sport: 'Boxing' });

    const contains = calls.filter((call) => call.method === 'contains');
    expect(contains).toHaveLength(1);
    expect(contains[0].args[0]).toBe('sports');
    expect(contains[0].args[1]).toEqual(['Boxing']);
  });

  it('never filters on specialties, whatever the sport', async () => {
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c, { sport: 'Yoga' });

    expect(calls.some((call) => call.args[0] === 'specialties')).toBe(false);
  });

  it('adds no sport filter at all when none is selected', async () => {
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c);

    expect(calls.some((call) => call.method === 'contains')).toBe(false);
  });

  it('requests both columns, since specialties stays searchable', async () => {
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c, calls } = client([]);

    await fetchInstructors(c);

    const cols = String(calls.find((call) => call.method === 'select')?.args[0] ?? '')
      .split(',')
      .map((s) => s.trim());
    expect(cols).toContain('sports');
    expect(cols).toContain('specialties');
  });

  it('keeps the two lists apart on the mapped profile', async () => {
    orgIds.mockResolvedValue({ success: true, data: [] });
    const { client: c } = client([
      complete({
        id: 'u1',
        name: 'Salomon',
        sports: ['Boxing', 'Muay Thai'],
        specialties: ['Entrenamiento deportivo & Recreativo.'],
      }),
    ]);

    const result = await fetchInstructors(c);

    expect(result.success).toBe(true);
    expect(result.data?.[0].sports).toEqual(['Boxing', 'Muay Thai']);
    expect(result.data?.[0].specialties).toEqual(['Entrenamiento deportivo & Recreativo.']);
  });

  it('defaults a null sports column to an empty array rather than undefined', async () => {
    // Every live instructor row predates `sports` being required, and
    // `i.sports.includes(...)` on the client would throw on undefined.
    orgIds.mockResolvedValue({ success: true, data: [] });
    // `specialties` must stay non-empty here: the T-PROF1 completeness filter
    // (lib/instructorProfile.ts) drops a row with no specialty before the
    // mapping runs, so a fixture with both columns null would be filtered out
    // and this test would pass without ever exercising the mapping.
    const { client: c } = client([complete({ id: 'u1', name: 'Jermaine', sports: null, specialties: ['Coach'] })]);

    const result = await fetchInstructors(c);

    expect(result.data?.[0].sports).toEqual([]);
  });
});
