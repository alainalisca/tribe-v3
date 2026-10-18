import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T-JOIN1b: a test session (sessions.is_test) is in none of the public
 * lists. Each query that feeds one must say so; a new public list that
 * forgets would show Al's test sessions to everyone.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('test sessions are hidden from every public list', () => {
  it.each([
    ['home feed', 'lib/dal/sessions.ts'],
    ['search', 'app/search/page.tsx'],
    ['site live board and /deportes pages', 'lib/site/week.ts'],
    ['site roster counts', 'lib/site/roster.ts'],
    ['coach page upcoming list', 'lib/site/coachPage.ts'],
    ['coach card gym count', 'lib/og/coachCard.ts'],
    ['sitemap', 'lib/dal/sitemap.ts'],
  ])('%s (%s) filters is_test', (_surface, file) => {
    expect(read(file)).toMatch(/\.eq\('is_test', false\)/);
  });

  it('the share card and the session page read the rule from one place', () => {
    expect(read('lib/og/sessionCard.ts')).toMatch(/export function sharesAsHomeCard/);
    expect(read('app/session/[id]/layout.tsx')).toMatch(/viewerCanSeeTestSession/);
  });
});
