/**
 * RLS-H4 Gate 1+2 contracts.
 *
 * (a) fetchSessionPublicView — the ANON read path for /session/[id] — must query
 *     the sessions_public VIEW, never the base table, or a logged-out visitor's
 *     page 401s the moment Gate 3 revokes anon from the base table. It also
 *     remaps the flattened host columns to the { creator } shape and returns no
 *     participants (the roster view is authenticated-only).
 *
 * (b) Migration 138 must have closed the validate_invite_token whole-row leak
 *     (no to_jsonb of the sessions row) and the sessions_public view must exclude
 *     payment_instructions, round both coordinate pairs, and stub invite_only.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchSessionPublicView } from './sessions';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

/** Captures the table name passed to .from(). */
function buildMock(row: Record<string, unknown> | null) {
  const calls: string[] = [];
  const client = {
    from: (table: string) => {
      calls.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const VIEW_ROW = {
  id: 's1',
  title: 'Morning Run',
  sport: 'running',
  join_policy: 'open',
  location: 'Laureles',
  latitude: 6.245,
  longitude: -75.596,
  creator_id: 'u1',
  creator_name: 'Ana',
  creator_avatar_url: 'https://x/a.png',
  creator_average_rating: 4.8,
};

describe('fetchSessionPublicView — reads the view, not the base table', () => {
  it('queries public.sessions_public', async () => {
    const { client, calls } = buildMock(VIEW_ROW);

    const result = await fetchSessionPublicView(client, 's1');

    expect(result.success).toBe(true);
    expect(calls).toEqual(['sessions_public']);
    // The security assertion: it must NOT touch the base table.
    expect(calls).not.toContain('sessions');
  });

  it('remaps the flattened host columns to a { creator } object', async () => {
    const { client } = buildMock(VIEW_ROW);

    const result = await fetchSessionPublicView(client, 's1');

    expect(result.data?.creator).toEqual({
      id: 'u1',
      name: 'Ana',
      avatar_url: 'https://x/a.png',
      average_rating: 4.8,
      total_reviews: null,
    });
  });

  it('returns no participants (roster is authenticated-only)', async () => {
    const { client } = buildMock(VIEW_ROW);
    const result = await fetchSessionPublicView(client, 's1');
    expect(result.data?.participants).toEqual([]);
  });

  it('maps a missing row to session_not_found', async () => {
    const { client } = buildMock(null);
    const result = await fetchSessionPublicView(client, 'nope');
    expect(result).toEqual({ success: false, error: 'session_not_found' });
  });
});

describe('migration 138 — the leak-closing contract', () => {
  const sql = readFileSync(
    join(__dirname, '../../supabase/migrations/138_rls_h4_gate1_sessions_public_view.sql'),
    'utf8'
  );

  it('validate_invite_token no longer returns to_jsonb of the whole row', () => {
    expect(sql).not.toContain('to_jsonb(s)');
  });

  it('the view excludes payment_instructions', () => {
    // Only appears in prose (the comment explaining the exclusion), never as a
    // selected column. A selected column would look like `s.payment_instructions`.
    expect(sql).not.toContain('s.payment_instructions');
  });

  it('the view rounds BOTH coordinate pairs to 3dp', () => {
    for (const col of ['latitude', 'longitude', 'location_lat', 'location_lng']) {
      expect(sql).toContain(`round(s.${col}::numeric, 3)`);
    }
  });

  it('EXCLUDES invite_only sessions entirely (not just location-stubbed)', () => {
    expect(sql).toMatch(/WHERE s\.\join_policy IS DISTINCT FROM 'invite_only'/);
    // The old stub approach must be gone.
    expect(sql).not.toContain("join_policy = 'invite_only' THEN NULL");
  });

  it('revokes from anon explicitly, not just PUBLIC (the repeated trap)', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.sessions_public FROM PUBLIC, anon/);
  });
});
