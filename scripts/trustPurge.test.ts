import { describe, it, expect } from 'vitest';
import { planStep, TARGETS } from './trust-purge';

/** T-JOIN1 Part C: the trust purge plans by id AND name, and only flags or hides. */
const NOW = '2026-10-18T12:00:00.000Z';
const byKind = (kind: string) => TARGETS.find((t) => t.kind === kind)!;

describe('trust-purge plan', () => {
  it('targets exactly what Al decided: two users, one community, one partner, one gym', () => {
    expect(TARGETS.map((t) => [t.kind, t.name])).toEqual([
      ['flag-user', 'Claude Marc-Charles'],
      ['flag-user', 'Demo'],
      ['delete-community', 'PRUEBA TZ - borrar'],
      ['hide-partner', 'TEST Tribe pass (not a real gym)'],
      ['hide-gym', 'BullBox (Prueba)'],
    ]);
  });

  it('flags a user, with the SQL that undoes it', () => {
    const t = byKind('flag-user');
    const s = planStep(t, { id: t.id, name: t.name, is_test_account: false, deleted_at: null }, NOW);
    expect(s.update).toEqual({ is_test_account: true });
    expect(s.undo).toBe(`UPDATE public.users SET is_test_account = false WHERE id = '${t.id}';`);
  });

  it('deletes the community softly, through deleted_at, never a hard delete', () => {
    const t = byKind('delete-community');
    const s = planStep(t, { id: t.id, name: t.name, deleted_at: null }, NOW);
    expect(s.update).toEqual({ deleted_at: NOW });
  });

  it('hides the partner and the gym, sending only what differs', () => {
    const p = byKind('hide-partner');
    expect(planStep(p, { id: p.id, business_name: p.name, status: 'pending', pass_active: false }, NOW).update).toEqual(
      {
        status: 'expired',
      }
    );
    const g = byKind('hide-gym');
    expect(
      planStep(g, { id: g.id, name: g.name, deleted_at: null, intelligence_email_enabled: true }, NOW).update
    ).toEqual({ deleted_at: NOW, intelligence_email_enabled: false });
  });

  it('skips a row whose name changed, and a row that is gone', () => {
    const t = byKind('flag-user');
    const renamed = planStep(t, { id: t.id, name: 'Someone Real', is_test_account: false }, NOW);
    expect(renamed.update).toBeNull();
    expect(renamed.line).toContain('NAME IS NOW "Someone Real", skipped');
    expect(planStep(t, null, NOW).line).toContain('NOT FOUND, skipped');
  });

  it('reports a target already in place as done and changes nothing', () => {
    const t = byKind('flag-user');
    const s = planStep(t, { id: t.id, name: t.name, is_test_account: true }, NOW);
    expect(s.update).toBeNull();
    expect(s.line).toContain('already done');
  });

  it('keeps an existing deleted_at rather than moving it', () => {
    const t = byKind('delete-community');
    const s = planStep(t, { id: t.id, name: t.name, deleted_at: '2026-01-01T00:00:00Z' }, NOW);
    expect(s.update).toBeNull();
  });
});
