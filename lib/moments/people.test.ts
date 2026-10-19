import { describe, it, expect } from 'vitest';
import { mergePeople, type PeopleRows } from './people';

const rows = (over: Partial<PeopleRows> = {}): PeopleRows => ({
  hostId: 'h',
  users: [
    { id: 'h', name: 'Salomon', avatar_url: null },
    { id: 'a', name: 'Ana', avatar_url: null },
    { id: 'b', name: 'Banned', avatar_url: null, banned: true },
    { id: 't', name: 'Test', avatar_url: null, is_test_account: true },
  ],
  participants: [
    { id: 'p1', user_id: 'a', is_guest: false, guest_name: null, guest_phone: null, status: 'confirmed' },
    { id: 'p2', user_id: 'h', is_guest: false, guest_name: null, guest_phone: null, status: 'confirmed' },
    { id: 'p3', user_id: 'b', is_guest: false, guest_name: null, guest_phone: null, status: 'confirmed' },
    { id: 'p4', user_id: 't', is_guest: false, guest_name: null, guest_phone: null, status: 'confirmed' },
    { id: 'p5', user_id: null, is_guest: true, guest_name: 'Carolina', guest_phone: null, status: 'confirmed' },
    { id: 'p6', user_id: null, is_guest: true, guest_name: 'Mateo', guest_phone: '+573001112233', status: 'confirmed' },
    { id: 'p7', user_id: 'x', is_guest: false, guest_name: null, guest_phone: null, status: 'pending' },
  ],
  invites: [],
  ...over,
});

describe('mergePeople (T-MOM1 picker)', () => {
  it('host first, then confirmed accounts, then guests ("Quién llegó" names included); never hidden accounts', () => {
    const people = mergePeople(rows());
    expect(people.map((p) => `${p.kind}:${p.name}`)).toEqual([
      'host:Salomon',
      'user:Ana',
      'guest:Carolina',
      'guest:Mateo',
    ]);
    expect(people.find((p) => p.name === 'Carolina')).toMatchObject({ hasPhone: false });
  });

  it('a guest already turned into an invite shows once, as the invite', () => {
    const people = mergePeople(
      rows({
        invites: [
          { id: 'i1', display_name: 'Mateo', phone: '+573001112233', claimed_by: null },
          { id: 'i2', display_name: 'carolina', phone: null, claimed_by: null },
        ],
      })
    );
    expect(people.filter((p) => p.kind === 'guest')).toHaveLength(0);
    expect(people.filter((p) => p.kind === 'invite').map((p) => p.name)).toEqual(['Mateo', 'carolina']);
  });
});
