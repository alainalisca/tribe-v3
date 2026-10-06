import { describe, it, expect } from 'vitest';

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

// --- Helpers re-implemented for testing (mirrors page.tsx) ---

function daysAgoInTz(isoString: string, tz: string, now?: Date): number {
  const ref = now ?? new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const toMs = (d: Date) => {
    const p = fmt.formatToParts(d);
    return Date.UTC(
      Number(p.find((x) => x.type === 'year')!.value),
      Number(p.find((x) => x.type === 'month')!.value) - 1,
      Number(p.find((x) => x.type === 'day')!.value)
    );
  };
  return Math.round((toMs(ref) - toMs(new Date(isoString))) / 86_400_000);
}

function getNextStep(reasons: string[], language: 'en' | 'es'): string | null {
  const hasExpired = reasons.some((r) => r.includes('plan venció') || r.includes('Plan expired'));
  if (hasExpired) {
    return language === 'es' ? 'Plan vencido: ofrécele renovar hoy' : 'Plan expired: offer to renew today';
  }
  const hasExpiring = reasons.some(
    (r) => (r.includes('plan vence') || r.includes('Plan expires')) && !r.includes('venció')
  );
  if (hasExpiring) {
    return language === 'es' ? 'Su plan vence pronto: confirma la renovación' : 'Plan expiring soon: confirm renewal';
  }
  const hasTrend = reasons.some((r) => r.includes('menos que su promedio') || r.includes('less than average'));
  if (hasTrend) {
    return language === 'es'
      ? 'Aún viene menos que antes: invítale a la próxima clase'
      : 'Still visiting less: invite them to the next class';
  }
  return null;
}

const cameBackAgoEs = (d: number) => (d === 0 ? 'Volvió hoy' : d === 1 ? 'Volvió hace 1 día' : `Volvió hace ${d} días`);

const viaChannelEs = (ch: string) =>
  ch === 'whatsapp' ? 'por WhatsApp' : ch === 'call' ? 'por llamada' : ch === 'in_person' ? 'en persona' : '';

describe('ContactedCard subtitle wording', () => {
  it('builds "Volvió hace X días · contactado por {canal} hace Y días"', () => {
    const now = new Date('2026-10-06T17:00:00Z');
    const touchAt = '2026-10-03T15:00:00Z';
    const visitAt = '2026-10-05T20:00:00Z';

    const visitDays = daysAgoInTz(visitAt, 'America/Bogota', now);
    const touchDays = daysAgoInTz(touchAt, 'America/Bogota', now);
    const channelLabel = viaChannelEs('call');

    const agoLabel = touchDays === 1 ? 'hace 1 día' : `hace ${touchDays} días`;
    const subtitle = `${cameBackAgoEs(visitDays)} · contactado ${channelLabel} ${agoLabel}`;

    expect(subtitle).toBe('Volvió hace 1 día · contactado por llamada hace 3 días');
  });
});

describe('Next step priority', () => {
  it('expired plan wins over visiting-less trend', () => {
    const reasons = [
      'Viene 83% menos que su promedio / Visiting 83% less than average',
      'Su plan venció hace 8 días / Plan expired 8 days ago',
    ];
    expect(getNextStep(reasons, 'es')).toBe('Plan vencido: ofrécele renovar hoy');
    expect(getNextStep(reasons, 'en')).toBe('Plan expired: offer to renew today');
  });

  it('expiring-soon wins over trend when no expired', () => {
    const reasons = [
      'Viene 50% menos que su promedio / Visiting 50% less than average',
      'Su plan vence en 3 días / Plan expires in 3 days',
    ];
    expect(getNextStep(reasons, 'es')).toBe('Su plan vence pronto: confirma la renovación');
  });

  it('trend is used when no plan reason', () => {
    const reasons = ['Viene 60% menos que su promedio / Visiting 60% less than average'];
    expect(getNextStep(reasons, 'es')).toBe('Aún viene menos que antes: invítale a la próxima clase');
  });

  it('returns null when no matching reason', () => {
    const reasons = ['14 días sin venir / 14 days absent'];
    expect(getNextStep(reasons, 'es')).toBeNull();
  });
});

describe('Bogota timezone day boundary', () => {
  it('visit at 2026-10-06T00:30:00Z counts as Oct 5 in Bogota (1 day ago)', () => {
    const visitAt = '2026-10-06T00:30:00Z';
    const now = new Date('2026-10-06T17:00:00Z');
    const days = daysAgoInTz(visitAt, 'America/Bogota', now);
    expect(days).toBe(1);
  });

  it('same visit in UTC would be 0 days ago (wrong)', () => {
    const visitAt = '2026-10-06T00:30:00Z';
    const now = new Date('2026-10-06T17:00:00Z');
    const utcDays = Math.floor((now.getTime() - new Date(visitAt).getTime()) / 86_400_000);
    expect(utcDays).toBe(0);
  });
});
