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
import {
  grantPhotographer,
  grantPhotographerByHandle,
  handleFromInput,
  loadPhotographers,
  revokePhotographer,
  splitPhotographers,
} from './photographers';

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

describe('a photographer by Tribe handle (T-MOM1, Al 2026-10-19)', () => {
  const users = [
    { id: 'crew', handle: 'camilo_foto', is_test_account: false, banned: false, deleted_at: null },
    { id: 'test', handle: 'probador', is_test_account: true, banned: false, deleted_at: null },
    { id: 'ban', handle: 'baneado', is_test_account: false, banned: true, deleted_at: null },
    { id: 'gone', handle: 'borrado', is_test_account: false, banned: false, deleted_at: '2026-01-01' },
    { id: 'host', handle: 'salomon', is_test_account: false, banned: false, deleted_at: null },
  ];

  it('an exact handle (with or without @, any case) names a listed account', async () => {
    const { client, db } = fakeDb({ session_photographers: [], users });
    expect(await grantPhotographerByHandle(client, 's1', ' @Camilo_Foto ', 'host', 'host')).toEqual({ ok: true });
    expect(db.session_photographers.map((r) => r.user_id)).toEqual(['crew']);
  });

  it('never a test, banned or deleted account, never a partial match, and the host is told apart', async () => {
    const { client, db } = fakeDb({ session_photographers: [], users });
    for (const h of ['probador', 'baneado', 'borrado', 'camilo', 'camilo_fot', 'nadie'])
      expect(await grantPhotographerByHandle(client, 's1', h, 'host', 'host')).toEqual({ ok: false, error: 'not_found' });
    expect(await grantPhotographerByHandle(client, 's1', 'salomon', 'host', 'host')).toEqual({
      ok: false,
      error: 'host',
    });
    expect(db.session_photographers).toEqual([]);
  });

  it('handleFromInput keeps only a valid handle', () => {
    expect(handleFromInput('@Camilo_Foto')).toBe('camilo_foto');
    expect(handleFromInput('a b')).toBeNull();
    expect(handleFromInput('%')).toBeNull();
  });
});
