import { describe, it, expect } from 'vitest';
import { diffMarks, initialMarks } from './TagPicker';
import type { MomentItem, TaggablePerson } from '@/lib/moments/types';

const people: TaggablePerson[] = [
  { kind: 'host', id: 'h', name: 'Salomon', avatarUrl: null },
  { kind: 'user', id: 'a', name: 'Ana', avatarUrl: null },
  { kind: 'guest', id: 'g', name: 'Carolina', hasPhone: false },
  { kind: 'invite', id: 'i', name: 'Mateo', hasPhone: true, claimed: false },
];
const tag = (kind: 'user' | 'invite', personId: string) => ({
  id: `${personId}`,
  kind,
  personId,
  name: '',
  delivered: false,
  removed: false,
});
const photo = (id: string, tags: ReturnType<typeof tag>[]): MomentItem => ({
  id,
  gridUrl: null,
  width: null,
  height: null,
  uploaderId: 'x',
  createdAt: '',
  tags,
});

describe('TagPicker marks (T-MOM1)', () => {
  const selected = [photo('m1', [tag('user', 'a'), tag('invite', 'i')]), photo('m2', [tag('user', 'a')])];

  it('all, some or none across the selected photos', () => {
    const marks = initialMarks(people, selected);
    expect(Object.fromEntries(marks)).toEqual({
      'user:h': 'none',
      'user:a': 'all',
      'guest:g': 'none',
      'invite:i': 'some',
    });
  });

  it('"Listo" adds the newly checked to every photo and removes the unchecked; a guest is added as itself', () => {
    const before = initialMarks(people, selected);
    const after = new Map(before)
      .set('user:h', 'all')
      .set('guest:g', 'all')
      .set('user:a', 'none')
      .set('invite:i', 'none');
    expect(diffMarks(people, before, after)).toEqual({
      add: [
        { kind: 'user', id: 'h' },
        { kind: 'guest', id: 'g' },
      ],
      remove: [
        { kind: 'user', id: 'a' },
        { kind: 'invite', id: 'i' },
      ],
    });
  });

  it('untouched people send nothing', () => {
    const before = initialMarks(people, selected);
    expect(diffMarks(people, before, new Map(before))).toEqual({ add: [], remove: [] });
  });
});
