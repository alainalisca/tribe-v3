import { describe, it, expect } from 'vitest';
import { SITE_SPORT_SLUGS } from './paths';
import { SPORT_PAGES, sportPage } from './sportPages';
import { SPORT_GROUPS } from './sportGroups';

/** T-SHARE1 Part B: each sport page shows real app sports, from the group it opens on. */
describe('sport pages', () => {
  it('one page per shared sport, each with app sports from its own group', () => {
    expect(SPORT_PAGES.map((p) => p.slug)).toEqual([...SITE_SPORT_SLUGS]);
    for (const page of SPORT_PAGES) {
      const group = SPORT_GROUPS.find((g) => g.key === page.group);
      expect(page.sports.length, page.slug).toBeGreaterThan(0);
      for (const s of page.sports) expect(group?.sports, `${page.slug}: ${s}`).toContain(s);
    }
  });

  it('MMA is the combat group without Boxing; Funcional is the strength sports CrossFit and HYROX leave', () => {
    expect(sportPage('mma')?.sports.slice().sort()).toEqual(['Jiu-Jitsu', 'Kickboxing', 'Muay Thai']);
    expect(sportPage('funcional')?.sports.slice().sort()).toEqual(['Calisthenics', 'Weightlifting']);
    expect(sportPage('curling')).toBeNull();
  });
});
