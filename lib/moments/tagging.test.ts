import { describe, it, expect } from 'vitest';
import { planTagChanges } from './tagging';

describe('planTagChanges (T-MOM1)', () => {
  const existing = [
    { id: 't1', media_id: 'm1', user_id: 'ana', invite_id: null, removed_at: null },
    { id: 't2', media_id: 'm2', user_id: 'ana', invite_id: null, removed_at: '2026-10-19T00:00:00Z' },
  ];

  it('tags everyone on every photo once, skipping who is already there', () => {
    const plan = planTagChanges({
      mediaIds: ['m1', 'm3'],
      subjects: [
        { kind: 'user', id: 'ana' },
        { kind: 'invite', id: 'inv' },
      ],
      existing,
      mode: 'add',
    });
    expect(plan.insert).toEqual([
      { media_id: 'm1', user_id: null, invite_id: 'inv' },
      { media_id: 'm3', user_id: 'ana', invite_id: null },
      { media_id: 'm3', user_id: null, invite_id: 'inv' },
    ]);
  });

  it('never re-tags someone who removed themselves ("Quitarme de esta foto")', () => {
    const plan = planTagChanges({ mediaIds: ['m2'], subjects: [{ kind: 'user', id: 'ana' }], existing, mode: 'add' });
    expect(plan.insert).toEqual([]);
  });

  it('untagging deletes the tag, but never the row of someone who removed themselves', () => {
    const plan = planTagChanges({
      mediaIds: ['m1', 'm2'],
      subjects: [{ kind: 'user', id: 'ana' }],
      existing,
      mode: 'remove',
    });
    expect(plan.deleteIds).toEqual(['t1']);
  });
});
