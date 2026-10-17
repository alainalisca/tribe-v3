import { describe, it, expect } from 'vitest';
import { SPORTS_LIST } from '@/lib/sports';
import { SPORT_GROUPS } from './sportGroups';

describe('Deportes groups (T-SITE1 Part E)', () => {
  it('lists every sport in the app exactly once', () => {
    const listed = SPORT_GROUPS.flatMap((g) => g.sports);
    expect([...listed].sort()).toEqual([...SPORTS_LIST].sort());
    expect(new Set(listed).size).toBe(listed.length);
  });
});
