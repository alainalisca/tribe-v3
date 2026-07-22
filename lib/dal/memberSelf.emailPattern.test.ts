/**
 * Identity-scoping regression tests for lib/dal/memberSelf.ts.
 *
 * Both member-facing lookups resolve identity with `.ilike('email', ...)`.
 * That is deliberate — coaches type client emails by hand, so a stored
 * `John@Gym.com` must still match the caller's lowercased auth email, which a
 * case-sensitive `.eq()` would not.
 *
 * The risk is that ilike is a PATTERN match: an unescaped `a_b@example.com`
 * also matches `axb@example.com`, pulling another member's name, email,
 * attendance and payment rows into the caller's own data export. These tests
 * capture the exact pattern handed to PostgREST and assert both properties at
 * once: wildcards neutralised, case-insensitivity retained.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
  log: vi.fn(),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  vi.resetModules();
});

/** Captures every (column, pattern) pair passed to .ilike(). */
interface Captured {
  ilike: Array<{ column: string; pattern: string }>;
}

function buildCapturingMock(captured: Captured): SupabaseClient {
  const makeChain = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.not = self;
    chain.eq = self;
    chain.in = self;
    chain.or = self;
    chain.order = self;
    chain.ilike = (column: string, pattern: string) => {
      captured.ilike.push({ column, pattern });
      return chain;
    };
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    return chain;
  };
  return { from: () => makeChain() } as unknown as SupabaseClient;
}

async function loadDal(captured: Captured) {
  vi.doMock('@supabase/supabase-js', async () => {
    const actual = await vi.importActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
    return { ...actual, createClient: () => buildCapturingMock(captured) };
  });
  return import('./memberSelf');
}

describe('buildMyDataExport — email is matched literally, not as a pattern', () => {
  it('escapes an underscore so it cannot match another member', async () => {
    const captured: Captured = { ilike: [] };
    const { buildMyDataExport } = await loadDal(captured);

    const result = await buildMyDataExport('a_b@example.com');

    expect(result.success).toBe(true);
    expect(captured.ilike).toEqual([{ column: 'email', pattern: 'a\\_b@example.com' }]);
    // The unescaped form is what leaked axb@example.com.
    expect(captured.ilike[0].pattern).not.toBe('a_b@example.com');
  });

  it('escapes an all-underscore local-part (the mass-match case)', async () => {
    const captured: Captured = { ilike: [] };
    const { buildMyDataExport } = await loadDal(captured);

    await buildMyDataExport('_____@example.com');

    expect(captured.ilike[0].pattern).toBe('\\_\\_\\_\\_\\_@example.com');
  });

  it('escapes a percent sign', async () => {
    const captured: Captured = { ilike: [] };
    const { buildMyDataExport } = await loadDal(captured);

    await buildMyDataExport('a%b@example.com');

    expect(captured.ilike[0].pattern).toBe('a\\%b@example.com');
  });

  it('still lowercases, so a coach-typed mixed-case row keeps matching', async () => {
    // The regression a .eq() swap would have caused: this must stay ilike +
    // lowercase, or members silently lose their own export.
    const captured: Captured = { ilike: [] };
    const { buildMyDataExport } = await loadDal(captured);

    await buildMyDataExport('  John@Example.COM  ');

    expect(captured.ilike[0].pattern).toBe('john@example.com');
  });
});

describe('listMyMemberships — same identity contract', () => {
  it('escapes wildcards in the caller email', async () => {
    const captured: Captured = { ilike: [] };
    const { listMyMemberships } = await loadDal(captured);

    const result = await listMyMemberships('a_b@example.com');

    expect(result.success).toBe(true);
    expect(captured.ilike).toEqual([{ column: 'email', pattern: 'a\\_b@example.com' }]);
  });

  it('preserves case-insensitive matching', async () => {
    const captured: Captured = { ilike: [] };
    const { listMyMemberships } = await loadDal(captured);

    await listMyMemberships('John@Example.COM');

    expect(captured.ilike[0].pattern).toBe('john@example.com');
  });

  it('leaves an ordinary address unchanged', async () => {
    const captured: Captured = { ilike: [] };
    const { listMyMemberships } = await loadDal(captured);

    await listMyMemberships('john.doe+gym@example.com');

    expect(captured.ilike[0].pattern).toBe('john.doe+gym@example.com');
  });
});
