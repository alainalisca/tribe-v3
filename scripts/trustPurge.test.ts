import { describe, it, expect } from 'vitest';
import { NEVER_FLAG, planStep, reviewCandidates, TARGETS } from './trust-purge';

/** T-JOIN1 Part C: the trust purge plans by id AND name, and only flags or hides. */
const NOW = '2026-10-18T12:00:00.000Z';
const byKind = (kind: string) => TARGETS.find((t) => t.kind === kind)!;

describe('trust-purge plan', () => {
  it('targets exactly what Al decided: Demo, one community, one partner, one gym', () => {
    expect(TARGETS.map((t) => [t.kind, t.name])).toEqual([
      ['delete-user', 'Demo'],
      ['delete-community', 'PRUEBA TZ - borrar'],
      ['hide-partner', 'TEST Tribe pass (not a real gym)'],
      ['hide-gym', 'BullBox (Prueba)'],
    ]);
  });

  it("never names Claude Marc-Charles (a real user, Al's uncle)", () => {
    const uncle = '15bae2c6-cf33-4566-ab8a-df5d455cc578';
    expect(NEVER_FLAG.map((u) => u.id)).toContain(uncle);
    expect(TARGETS.map((t) => t.id)).not.toContain(uncle);
  });

  it('keeps him off the review list even though the pattern matches his name', () => {
    const users = [
      {
        id: '15bae2c6-cf33-4566-ab8a-df5d455cc578',
        name: 'Claude Marc-Charles',
        is_test_account: false,
        deleted_at: null,
      },
      { id: 'x1', name: 'Prueba Nueva', is_test_account: false, deleted_at: null },
      { id: 'x2', name: 'test', is_test_account: true, deleted_at: null },
      { id: 'x3', name: 'Ana Gómez', is_test_account: false, deleted_at: null },
    ];
    expect(reviewCandidates(users).map((u) => u.name)).toEqual(['Prueba Nueva']);
  });

  it('soft-deletes Demo through deleted_at, keeping a date already there', () => {
    const t = byKind('delete-user');
    expect(planStep(t, { id: t.id, name: t.name, is_test_account: false, deleted_at: null }, NOW).update).toEqual({
      deleted_at: NOW,
    });
    const done = planStep(
      t,
      { id: t.id, name: t.name, is_test_account: false, deleted_at: '2026-10-10T13:10:07Z' },
      NOW
    );
    expect(done.update).toBeNull();
    expect(done.line).toContain('already done');
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
    const t = byKind('delete-user');
    const renamed = planStep(t, { id: t.id, name: 'Someone Real', deleted_at: null }, NOW);
    expect(renamed.update).toBeNull();
    expect(renamed.line).toContain('NAME IS NOW "Someone Real", skipped');
    expect(planStep(t, null, NOW).line).toContain('NOT FOUND, skipped');
  });

  it('reports a target already in place as done and changes nothing', () => {
    const t = byKind('hide-partner');
    const s = planStep(t, { id: t.id, business_name: t.name, status: 'expired', pass_active: false }, NOW);
    expect(s.update).toBeNull();
    expect(s.line).toContain('already done');
  });

  it('keeps an existing deleted_at rather than moving it', () => {
    const t = byKind('delete-community');
    const s = planStep(t, { id: t.id, name: t.name, deleted_at: '2026-01-01T00:00:00Z' }, NOW);
    expect(s.update).toBeNull();
  });
});
