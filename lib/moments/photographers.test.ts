import { describe, it, expect, vi } from 'vitest';

vi.mock('./people', () => ({
  loadTaggablePeople: async () => [
    { kind: 'host', id: 'host', name: 'Salomon', avatarUrl: null },
    { kind: 'user', id: 'ana', name: 'Ana', avatarUrl: null },
    { kind: 'user', id: 'juan', name: 'Juan', avatarUrl: null },
    { kind: 'guest', id: 'g1', name: 'Carolina', hasPhone: false },
  ],
}));

import { fakeDb } from './testing/fakeDb';
import { grantPhotographer, loadPhotographers, revokePhotographer, splitPhotographers } from './photographers';

/** T-MOM1 Part C: "Fotógrafo de esta sesión" is picked from the session's people on Tribe, never the host. */
describe('session photographers (T-MOM1 Part C)', () => {
  it('splits the roster into photographers and who could be one; the host and guests are neither', () => {
    const out = splitPhotographers(
      [
        { kind: 'host', id: 'host', name: 'S' },
        { kind: 'user', id: 'ana', name: 'Ana' },
        { kind: 'user', id: 'juan', name: 'Juan' },
        { kind: 'guest', id: 'g1', name: 'C' },
      ],
      new Set(['ana', 'gone']),
      [{ id: 'gone', name: 'Left the session', avatarUrl: null }]
    );
    expect(out.photographers.map((p) => p.id)).toEqual(['ana', 'gone']);
    expect(out.candidates.map((p) => p.id)).toEqual(['juan']);
  });

  it('grants someone in the session, refuses anyone else, and revokes', async () => {
    const { client, db } = fakeDb({ session_photographers: [], users: [] });
    expect(await grantPhotographer(client, 's1', 'ana', 'host')).toBe(true);
    expect(await grantPhotographer(client, 's1', 'stranger', 'host')).toBe(false);
    expect(await grantPhotographer(client, 's1', 'host', 'host')).toBe(false);
    expect(db.session_photographers.map((r) => r.user_id)).toEqual(['ana']);
    expect((await loadPhotographers(client, 's1')).photographers.map((p) => p.id)).toEqual(['ana']);
    await revokePhotographer(client, 's1', 'ana');
    expect(db.session_photographers).toEqual([]);
  });
});
