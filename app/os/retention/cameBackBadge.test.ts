import { describe, it, expect } from 'vitest';

/**
 * The "Volvió" badge logic extracted from RetentionPage:
 *
 * contactedThisWeek includes ALL members with a touch in the last 7 days,
 * regardless of level or days_since_last_activity.
 *
 * cameBack = last_activity_at > last_touch.created_at
 *
 * Members who came back sort to the top of the contacted section.
 */

interface MemberRow {
  id: string;
  level: string | null;
  days_since_last_activity: number | null;
  last_activity_at: string | null;
  last_touch: { id: string; channel: string; created_at: string } | null;
}

function computeContactedWithBadge(members: MemberRow[]) {
  const contacted = members
    .filter((m) => m.last_touch !== null)
    .map((m) => {
      const cameBack =
        m.last_touch != null &&
        m.last_activity_at != null &&
        new Date(m.last_activity_at) > new Date(m.last_touch.created_at);
      return { ...m, cameBack };
    })
    .sort((a, b) => {
      if (a.cameBack !== b.cameBack) return a.cameBack ? -1 : 1;
      return new Date(b.last_touch!.created_at).getTime() - new Date(a.last_touch!.created_at).getTime();
    });

  const contactedIds = new Set(contacted.map((m) => m.id));
  return { contacted, contactedIds };
}

describe('Volvió badge in contacted section', () => {
  it('shows badge when visit is after touch, even at level low', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    const touchAt = new Date(now.getTime() - 3 * 86_400_000).toISOString(); // 3 days ago
    const visitAt = new Date(now.getTime() - 1 * 86_400_000).toISOString(); // 1 day ago

    const members: MemberRow[] = [
      {
        id: 'client-1',
        level: 'low',
        days_since_last_activity: 1,
        last_activity_at: visitAt,
        last_touch: { id: 'touch-1', channel: 'whatsapp', created_at: touchAt },
      },
    ];

    const { contacted } = computeContactedWithBadge(members);

    expect(contacted).toHaveLength(1);
    expect(contacted[0].cameBack).toBe(true);
    expect(contacted[0].level).toBe('low');
  });

  it('does not show badge when visit is before touch', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    const visitAt = new Date(now.getTime() - 5 * 86_400_000).toISOString(); // 5 days ago
    const touchAt = new Date(now.getTime() - 2 * 86_400_000).toISOString(); // 2 days ago

    const members: MemberRow[] = [
      {
        id: 'client-2',
        level: 'high',
        days_since_last_activity: 5,
        last_activity_at: visitAt,
        last_touch: { id: 'touch-2', channel: 'call', created_at: touchAt },
      },
    ];

    const { contacted } = computeContactedWithBadge(members);

    expect(contacted).toHaveLength(1);
    expect(contacted[0].cameBack).toBe(false);
  });

  it('includes contacted member regardless of level (not just high/medium)', () => {
    const touchAt = new Date('2026-10-04T10:00:00Z').toISOString();

    const members: MemberRow[] = [
      {
        id: 'low-member',
        level: 'low',
        days_since_last_activity: 2,
        last_activity_at: null,
        last_touch: { id: 'touch-3', channel: 'in_person', created_at: touchAt },
      },
      {
        id: 'new-member',
        level: 'new',
        days_since_last_activity: 1,
        last_activity_at: null,
        last_touch: { id: 'touch-4', channel: 'whatsapp', created_at: touchAt },
      },
    ];

    const { contacted, contactedIds } = computeContactedWithBadge(members);

    expect(contacted).toHaveLength(2);
    expect(contactedIds.has('low-member')).toBe(true);
    expect(contactedIds.has('new-member')).toBe(true);
  });

  it('sorts members who came back to the top', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    const touchAt = new Date(now.getTime() - 3 * 86_400_000).toISOString();

    const members: MemberRow[] = [
      {
        id: 'still-away',
        level: 'high',
        days_since_last_activity: 10,
        last_activity_at: new Date(now.getTime() - 10 * 86_400_000).toISOString(),
        last_touch: { id: 't1', channel: 'whatsapp', created_at: touchAt },
      },
      {
        id: 'came-back',
        level: 'low',
        days_since_last_activity: 1,
        last_activity_at: new Date(now.getTime() - 1 * 86_400_000).toISOString(),
        last_touch: { id: 't2', channel: 'call', created_at: touchAt },
      },
    ];

    const { contacted } = computeContactedWithBadge(members);

    expect(contacted[0].id).toBe('came-back');
    expect(contacted[0].cameBack).toBe(true);
    expect(contacted[1].id).toBe('still-away');
    expect(contacted[1].cameBack).toBe(false);
  });

  it('excludes contacted members from contactToday candidates', () => {
    const touchAt = new Date('2026-10-04T10:00:00Z').toISOString();

    const members: MemberRow[] = [
      {
        id: 'contacted-high',
        level: 'high',
        days_since_last_activity: 10,
        last_activity_at: null,
        last_touch: { id: 't1', channel: 'whatsapp', created_at: touchAt },
      },
      {
        id: 'not-contacted-high',
        level: 'high',
        days_since_last_activity: 10,
        last_activity_at: null,
        last_touch: null,
      },
    ];

    const { contactedIds } = computeContactedWithBadge(members);

    const contactToday = members.filter(
      (m) =>
        !contactedIds.has(m.id) &&
        (m.level === 'high' || m.level === 'medium') &&
        m.days_since_last_activity !== null &&
        m.days_since_last_activity >= 7 &&
        m.days_since_last_activity <= 30
    );

    expect(contactToday).toHaveLength(1);
    expect(contactToday[0].id).toBe('not-contacted-high');
  });
});
