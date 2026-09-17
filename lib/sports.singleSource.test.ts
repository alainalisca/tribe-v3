/**
 * Issue 1, item 4: ONE sport vocabulary, every consumer importing it.
 *
 * Before this, five modules declared a constant named SPORTS_LIST and no two
 * agreed. Instructor discovery offered 13 sports, the two partner-finding
 * screens offered 11, instructor onboarding offered 21 (six of which existed
 * nowhere else in the app), and the canonical list in lib/sports.ts has 23.
 * The user-visible consequence was Ronald Gallego's: the chips an instructor
 * picks from and the filter a searcher picks from were different lists, so the
 * two sides could not meet.
 *
 * Two guards, because the defect has two halves:
 *
 *   1. NO MODULE DECLARES ITS OWN LIST. Catches a sixth constant appearing
 *      anywhere, under any name, not just the five that existed.
 *   2. EVERY CONSUMER IMPORTS THE CANONICAL ONE. Catches the inverse: a
 *      surface that renders sport choices without reading lib/sports at all.
 *      Al's "every pair, not one pair" -- each consumer is asserted
 *      individually, so fixing one does not make the guard green for the rest.
 *
 * ON THE INSTRUMENT, because the first two attempts were both wrong.
 *
 * Counting how many canonical sport names appear as string literals in a file
 * reported EIGHT production offenders. Most were false: `app/messages/page.tsx`
 * and `LiveNowSection` hold nested ternaries mapping `session.sport` to an
 * emoji, which is a lookup KEYED on sport, not a declared vocabulary. A file
 * that switches on ten sports is not offering a choice of ten sports.
 *
 * Scanning array literals instead still reported `seedGymData` and
 * `CommunityNewsTab`, whose arrays hold OBJECTS -- session fixtures, and
 * `{key, en, es}` tab labels -- not a list of choices.
 *
 * So the instrument looks for an array of BARE STRING LITERALS, and finds the
 * brackets by depth-walking rather than with a regex, because `[^\[\]]` cannot
 * span a nested array and would truncate at the first inner bracket. That is
 * the same failure as `[^<>]` breaking on the `>` in `=>` when counting form
 * controls, recorded in CLAUDE.md.
 *
 * The threshold of two is measured, not guessed: after item 3 the only
 * production arrays of bare strings holding two or more canonical sports are
 * the two named in KNOWN_RIVAL_LISTS below.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPORTS_LIST } from './sports';

const REPO_ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = ['app', 'components', 'lib'];

/** The two canonical sources. They are allowed, and required, to hold the list. */
const CANONICAL = ['lib/sports.ts', 'lib/sportTranslationData.ts'];

/**
 * Two or more canonical sports in one array literal is a vocabulary, not a
 * reference. Measured rather than chosen: see the header.
 */
const MIN_SPORTS_FOR_A_LIST = 2;

/**
 * Rival vocabularies that exist today, each with the reason it is not fixed
 * here. This is an allow-list of KNOWN DEBT, not of acceptable patterns, and
 * the second test fails if an entry stops offending -- so a fix must delete
 * its line rather than leave a stale exemption behind.
 */
const KNOWN_RIVAL_LISTS: Record<string, string> = {
  // A real rival picker, the same shape as the onboarding bug: SPECIALTY_OPTIONS
  // offers 'Salsa', 'HIIT', 'Martial Arts' and 'Functional Training', none of
  // them canonical. It writes featured_partner_applications.specialties, a
  // different table with a different audience, so aligning it is a vocabulary
  // decision for the partner flow rather than part of Issue 1.
  'components/partner/PartnerApplyForm.tsx': 'partner application specialties, own ticket',
  // mapCategoryToSports() derives SUGGESTED sports from a venue category and
  // emits 'Strength Training', 'Sprint Training' and 'Trail Running'. Derived
  // display values rather than a choice offered to anyone, but still a third
  // vocabulary, and the suggestions land in venues.suggested_sports.
  'app/api/venues/nearby/route.ts': 'venue category to suggested sports, own ticket',
};

/**
 * Every surface that offers a choice of sports, and must therefore read the
 * canonical list. Asserted one file at a time, so fixing one consumer cannot
 * turn the guard green for the others.
 */
const CONSUMERS = [
  'app/instructors/InstructorsPageClient.tsx',
  'app/training-partners/page.tsx',
  'components/FindTrainingPartners.tsx',
  'app/onboarding/instructor/page.tsx',
  'components/dashboard/StorefrontEditor.tsx',
  'app/profile/edit/page.tsx',
  'components/TrainingPreferencesForm.tsx',
];

const SPORTS = new Set<string>(SPORTS_LIST as readonly string[]);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/**
 * Every `[...]` block, located by bracket-depth walking. A regex character
 * class cannot do this: it terminates on the first `]`, so a nested array
 * truncates the match and the outer literal is never seen whole.
 */
function arrayLiterals(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '[') continue;
    let depth = 0;
    for (let j = i; j < source.length; j++) {
      if (source[j] === '[') depth++;
      else if (source[j] === ']') {
        depth--;
        if (depth === 0) {
          out.push(source.slice(i, j + 1));
          break;
        }
      }
    }
  }
  return out;
}

/** An array whose every element is a bare string literal: a list of choices. */
const BARE_STRINGS = /^\[\s*(?:(['"])[^'"\n]*\1\s*,\s*)*(['"])[^'"\n]*\2\s*,?\s*\]$/;

function sportListsIn(source: string): string[] {
  const found: string[] = [];
  for (const literal of arrayLiterals(stripComments(source))) {
    const flat = literal.replace(/\s+/g, ' ');
    if (!BARE_STRINGS.test(flat)) continue;
    const names = [...flat.matchAll(/['"]([^'"\n]+)['"]/g)].map((m) => m[1]);
    const hits = new Set(names.filter((nm) => SPORTS.has(nm)));
    if (hits.size >= MIN_SPORTS_FOR_A_LIST) found.push(flat.slice(0, 120));
  }
  return found;
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        out.push(rel);
      }
    }
  };
  SCAN_ROOTS.forEach(walk);
  return out;
}

describe('one sport vocabulary', () => {
  it('no module declares its own sport list', () => {
    // Test files are out of scope: a fixture legitimately enumerates sports
    // (app/profile/edit/page.test.tsx mocks SPORTS_LIST with three of them),
    // and a list that ships to a user cannot hide in a file that does not ship.
    const offenders: string[] = [];
    for (const file of productionFiles()) {
      if (CANONICAL.includes(file) || file in KNOWN_RIVAL_LISTS) continue;
      for (const literal of sportListsIn(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'))) {
        offenders.push(`${file}\n      ${literal}`);
      }
    }

    expect(
      offenders,
      `These modules declare their own sport list instead of importing SPORTS_LIST ` +
        `from lib/sports:\n\n    ${offenders.join('\n\n    ')}\n\n` +
        `Import the canonical list. If this module genuinely needs a different ` +
        `vocabulary, add it to KNOWN_RIVAL_LISTS with the reason, and open a ticket.`
    ).toEqual([]);
  });

  it('every known rival list still exists, so the allow-list cannot rot', () => {
    // Without this, fixing PartnerApplyForm would leave a permanent exemption
    // that silently re-permits the defect it was written to excuse.
    const fixed: string[] = [];
    for (const [file, reason] of Object.entries(KNOWN_RIVAL_LISTS)) {
      const full = path.join(REPO_ROOT, file);
      if (!fs.existsSync(full)) {
        fixed.push(`${file} no longer exists (${reason})`);
        continue;
      }
      if (sportListsIn(fs.readFileSync(full, 'utf-8')).length === 0) {
        fixed.push(`${file} no longer declares a sport list (${reason})`);
      }
    }

    expect(fixed, `Remove these from KNOWN_RIVAL_LISTS -- they are fixed:\n  ${fixed.join('\n  ')}`).toEqual([]);
  });

  describe('every consumer imports the canonical list', () => {
    for (const file of CONSUMERS) {
      it(`${file} imports SPORTS_LIST from lib/sports`, () => {
        const full = path.join(REPO_ROOT, file);
        expect(fs.existsSync(full), `${file} is listed as a sport consumer but does not exist`).toBe(true);

        const source = fs.readFileSync(full, 'utf-8');
        expect(
          /import\s*\{[^}]*\bSPORTS_LIST\b[^}]*\}\s*from\s*['"](?:@\/lib\/sports|\.\/sports|\.\.\/lib\/sports)['"]/.test(
            source
          ),
          `${file} offers a choice of sports but does not import SPORTS_LIST from lib/sports`
        ).toBe(true);
      });
    }
  });
});
