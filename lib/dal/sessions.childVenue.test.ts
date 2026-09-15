/**
 * A recurring series keeps its gym venue on future occurrences (T-GYM2, DoD 11).
 *
 * createChildSession copied `location` but not `partner_id`, so an approved
 * series kept the gym's address text and silently lost the gym itself on every
 * generated occurrence. Live on a7b498d6, a CrossFit series approved at
 * BullBox, whose one existing child only carries the link because Al set it by
 * hand in SQL.
 *
 * The venue is written directly rather than through set_session_partner because
 * this job runs as the SERVICE ROLE, which bypasses 162's column grants, and
 * because copying preserves the gym's actual decision: recomputing would flip a
 * declined series back to pending and re-queue it on every occurrence.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import { createChildSession, type RecurringParentSession } from './sessions';

/** Captures the row handed to .insert(). */
function captureInsert() {
  const captured: Record<string, unknown>[] = [];
  const builder = {
    insert: (row: Record<string, unknown>) => {
      captured.push(row);
      return {
        select: () => ({ single: () => Promise.resolve({ data: { id: 'child-1' }, error: null }) }),
      };
    },
  };
  return { client: { from: () => builder } as never, captured };
}

const PARENT = {
  id: 'parent-1',
  creator_id: 'coach',
  sport: 'CrossFit',
  location: 'CrossFit BullBox Ciudad del Río',
  date: '2026-09-10',
  start_time: '06:00',
  duration: 60,
  max_participants: 12,
  description: null,
  equipment: null,
  skill_level: null,
  gender_preference: null,
  join_policy: 'open',
  is_paid: false,
  price_cents: null,
  currency: 'COP',
  photos: null,
  location_lat: 6.2,
  location_lng: -75.57,
  latitude: 6.2,
  longitude: -75.57,
  title: null,
  visibility: 'public',
  platform_fee_percent: 0,
  recurrence_pattern: 'weekly',
  recurrence_end_date: null,
  partner_id: '040cbc21-1b11-4ae1-aa99-9fe35a32bda0',
  partner_status: 'approved',
  partner_reviewed_at: '2026-09-10T00:00:00Z',
} as unknown as RecurringParentSession;

describe('createChildSession carries the venue', () => {
  it('copies partner_id onto the generated occurrence', async () => {
    const { client, captured } = captureInsert();
    await createChildSession(client, PARENT, '2026-09-17');
    expect(captured[0].partner_id).toBe('040cbc21-1b11-4ae1-aa99-9fe35a32bda0');
  });

  it('copies the gym s decision rather than recomputing it', async () => {
    const { client, captured } = captureInsert();
    await createChildSession(client, PARENT, '2026-09-17');
    expect(captured[0].partner_status).toBe('approved');
    expect(captured[0].partner_reviewed_at).toBe('2026-09-10T00:00:00Z');
  });

  it('keeps a declined series declined instead of re-queueing it every week', async () => {
    // Recomputing would flip this to pending and put the same series in the
    // gym's queue on every occurrence.
    const { client, captured } = captureInsert();
    await createChildSession(client, { ...PARENT, partner_status: 'declined' } as RecurringParentSession, '2026-09-17');
    expect(captured[0].partner_status).toBe('declined');
  });

  it('leaves an unlinked series unlinked', async () => {
    const { client, captured } = captureInsert();
    await createChildSession(
      client,
      { ...PARENT, partner_id: null, partner_status: null, partner_reviewed_at: null } as RecurringParentSession,
      '2026-09-17'
    );
    expect(captured[0].partner_id).toBeNull();
    expect(captured[0].partner_status).toBeNull();
  });

  it('still copies the location text, which was never the missing half', async () => {
    const { client, captured } = captureInsert();
    await createChildSession(client, PARENT, '2026-09-17');
    expect(captured[0].location).toBe('CrossFit BullBox Ciudad del Río');
    expect(captured[0].date).toBe('2026-09-17');
  });
});
