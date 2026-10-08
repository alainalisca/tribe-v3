/**
 * THE TYPESCRIPT LIMIT AND THE SQL CHECK ARE ONE NUMBER, AND THIS FAILS IF THEY
 * STOP BEING.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A DISAGREEMENT HERE COSTS A LEAD RATHER THAN A FIELD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migrations 211 and 213 bound the attribution columns by SIZE and deliberately
 * not by shape, and 211's header explains the reasoning: a CHECK binds the
 * SERVICE ROLE too, so a CHECK that a sanitized value could fail does not reject
 * a bad parameter, it rejects the INSERT. For /api/pase that insert is a pass
 * lead -- a stranger standing in a gym who has just typed their phone number --
 * and 173's sanitizeTag settled that losing one of those over a malformed query
 * string is the wrong trade every time.
 *
 * The division of labour that makes it safe is:
 *
 *   SHAPE  lives in lib/attribution.ts, which drops a malformed tag to NULL.
 *          Failing soft is right: the cost is one field of reporting.
 *   SIZE   lives in both, at ONE value. The route nulls anything longer than
 *          ATTR_MAX_LEN, so nothing longer can ever reach the CHECK.
 *
 * That second line is an invariant between a .ts file and a .sql file, and
 * nothing in a type system or a migration can see across that gap. If somebody
 * raises ATTR_MAX_LEN to 64 to fit a longer campaign name, every tag between 41
 * and 64 characters starts reaching a CHECK that refuses it, and the symptom is
 * not a truncated field -- it is a 23514 on the insert and a lost lead, on
 * exactly the tagged links the change was made to support.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY IT PARSES THE MIGRATION INSTEAD OF RESTATING THE NUMBER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A test that said `expect(ATTR_MAX_LEN).toBe(40)` would be a THIRD copy of the
 * number, and the repo's history on duplicated constants is unambiguous:
 * SPORTS_LIST in five modules, two translation maps for the same 23 keys, three
 * hand-kept copies of the applied-migration list, three copies of one comment
 * stripper. A third copy agrees with the second one until someone changes the
 * first, and then it agrees with nothing.
 *
 * So the SQL is the corpus. The numbers are read out of the migration files and
 * compared to the exported constants, and the extraction asserts it found
 * something before asserting what it found -- a regex that matches nothing
 * produces an empty set, and every "all of them agree" assertion is true of an
 * empty set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sqlWithoutComments } from '../supabase/executableSql';
import { stripJsComments } from './stripJsComments';
import { ATTR_MAX_LEN, ATTR_MAX_PATH_LEN } from './attribution';

const MIGRATIONS = join(__dirname, '..', 'supabase', 'migrations');

const M211 = '211_t_grow1_lead_attribution.sql';
const M213 = '213_t_grow1_attribution_events.sql';

/**
 * Comments stripped with the repo's tokeniser before any matching.
 *
 * Both migration headers DISCUSS the 40 and the 200 in prose while explaining
 * why they are what they are, and 211's header says "a 40 char bound cannot
 * reject a sanitized tag because the route's own MAX_CODE_LEN is 40". A check
 * that read the raw file would happily find its expected number inside its own
 * justification and pass over SQL that said something else. That is the failure
 * this repo has now hit five times; the tokeniser is the fix, and it is the
 * tokeniser rather than a regex because it keeps string literals intact.
 */
function executable(file: string): string {
  return sqlWithoutComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
}

/** Every `BETWEEN 1 AND <n>` in a file's executable SQL. */
function betweenBounds(file: string): number[] {
  return [...executable(file).matchAll(/BETWEEN\s+1\s+AND\s+(\d+)/gi)].map((m) => Number(m[1]));
}

describe('the TypeScript attribution limits equal the SQL CHECK bounds', () => {
  /**
   * THE READ STEP, ASSERTED BEFORE WHAT IT FOUND.
   *
   * Every assertion below is a forall over the extracted numbers. An extraction
   * that returned nothing satisfies all of them. CLAUDE.md records migration
   * 180's version of this: a catalog read came back empty, `'' !~* '...'` was
   * true of the empty string, and three independent-looking checks passed over a
   * function that returned the forbidden column. Printing the counts is what
   * makes "(none)" visibly absurd instead of silently green.
   */
  it('extracts bounds from both migrations', () => {
    const b211 = betweenBounds(M211);
    const b213 = betweenBounds(M213);
    // 211: five tag columns at 40, plus landing_path at 200.
    expect(b211.length, `read no BETWEEN bounds out of ${M211}`).toBeGreaterThanOrEqual(6);
    // 213: seven tag columns at 40, plus landing_path at 200.
    expect(b213.length, `read no BETWEEN bounds out of ${M213}`).toBeGreaterThanOrEqual(8);
  });

  it('every 40-class tag bound in 211 and 213 equals ATTR_MAX_LEN', () => {
    for (const file of [M211, M213]) {
      const bounds = betweenBounds(file);
      // The tag bounds are every bound that is not the path bound. Partitioned by
      // value rather than by position, because position depends on the order the
      // columns happen to be written in and that is not a contract.
      const tagBounds = bounds.filter((n) => n !== ATTR_MAX_PATH_LEN);
      expect(tagBounds.length, `${file} has no tag bound distinct from the path bound`).toBeGreaterThan(0);
      expect(new Set(tagBounds), `${file} uses more than one tag bound`).toEqual(new Set([ATTR_MAX_LEN]));
    }
  });

  it('the landing_path bound in both migrations equals ATTR_MAX_PATH_LEN', () => {
    for (const file of [M211, M213]) {
      const sql = executable(file);
      const match = /char_length\(landing_path\)\s+BETWEEN\s+1\s+AND\s+(\d+)/i.exec(sql);
      expect(match, `${file} has no char_length(landing_path) bound to read`).not.toBeNull();
      expect(Number(match![1]), `${file}'s landing_path bound`).toBe(ATTR_MAX_PATH_LEN);
    }
  });

  /**
   * The route must null anything longer rather than truncating it, so nothing
   * oversized can reach the CHECK at all. Truncation would be worse than it
   * sounds: a 41-character code silently stored as its first 40 characters is a
   * row attributed to a campaign that does not exist, which is a wrong number
   * rather than a missing one.
   */
  it('a tag one character over the bound sanitizes to null, not to a truncation', async () => {
    const { sanitizeTag } = await import('./attribution');
    expect(sanitizeTag('a'.repeat(ATTR_MAX_LEN), 'src')).toBe('a'.repeat(ATTR_MAX_LEN));
    expect(sanitizeTag('a'.repeat(ATTR_MAX_LEN + 1), 'src')).toBeNull();
  });

  /**
   * The path is the opposite: truncated, never dropped. A path too long is still
   * the right path with its tail missing, while a tag that fails its rule is
   * probably not a tag.
   */
  it('a path over the bound truncates to exactly the bound', async () => {
    const { sanitizeLandingPath } = await import('./attribution');
    const long = '/' + 'p'.repeat(ATTR_MAX_PATH_LEN * 2);
    expect(sanitizeLandingPath(long)).toHaveLength(ATTR_MAX_PATH_LEN);
  });

  /**
   * The route's own limit is this module's, not a second copy.
   *
   * This is the assertion that would have caught the original state of the world:
   * /api/pase declared `const MAX_CODE_LEN = 40` of its own. Asserted by SOURCE
   * SCAN rather than by behaviour, because the defect lives in the file's
   * declarations and not in what the route does with them -- CLAUDE.md's
   * call-site/layer rule, and the same shape as lib/sports.singleSource.test.ts.
   */
  it('no API route declares its own attribution length limit', () => {
    const routes = ['app/api/pase/route.ts', 'app/api/attr/route.ts'];
    const offenders: string[] = [];
    for (const rel of routes) {
      let src: string;
      try {
        src = readFileSync(join(__dirname, '..', rel), 'utf8');
      } catch {
        offenders.push(`${rel} does not exist, so this check read nothing`);
        continue;
      }
      // stripJsComments, not the SQL tokeniser: this is TypeScript, and the two
      // languages disagree about what a comment is. Stripped at all for the same
      // reason as everywhere else here -- the route's own header prose discusses
      // its limits, and a check that reads prose finds whatever it expects.
      const stripped = stripJsComments(src);
      // A local numeric limit on a code or tag length, by any of the names this
      // repo has used for it.
      const local = /\b(?:const|let|var)\s+(MAX_CODE_LEN|MAX_TAG_LEN|ATTR_MAX_LEN|MAX_SRC_LEN)\s*=\s*\d/.exec(stripped);
      if (local) offenders.push(`${rel} declares its own ${local[1]}`);
      if (!/from\s+'@\/lib\/attribution'/.test(stripped)) {
        offenders.push(`${rel} does not import the shared limits from @/lib/attribution`);
      }
    }
    expect(
      offenders,
      'An API route must import ATTR_MAX_LEN and sanitizeTag from lib/attribution ' +
        'rather than redeclaring them. A second copy of this limit disagrees with the ' +
        'SQL CHECK the day one of them moves, and the symptom is a 23514 that loses a ' +
        'pass lead rather than a truncated field.'
    ).toEqual([]);
  });
});
