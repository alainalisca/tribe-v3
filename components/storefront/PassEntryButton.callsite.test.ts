/**
 * T-LEAD2 part A, the survivor guard.
 *
 * WHAT THIS EXISTS FOR. PassEntryButton makes three decisions itself and every
 * one of them is testable by mounting it. None of them is where this feature
 * can silently die. Two things decide whether the button ever appears on a real
 * phone, and both live outside the component:
 *
 *   1. WHAT IT IS HANDED. `isOwner={isOwn}` is a one-line prop expression in
 *      app/storefront/[id]/page.tsx. Pass a literal, pass the wrong variable,
 *      or stop passing it, and the component behaves perfectly while Leo is
 *      invited to claim his own gym's free class -- or, in the other direction,
 *      nobody sees the button at all.
 *   2. WHETHER THE ROW CARRIES THE COLUMN. The gate reads partner.pass_active.
 *      If the select that builds the row stops asking for pass_active, the
 *      field arrives undefined, hasClaimablePass() correctly returns false, and
 *      the entry point disappears everywhere with no error, no failing test and
 *      no wrong value to notice in review. An absent column reads as "this
 *      partner has no pass".
 *
 * A component test mounts with props the test supplies, so it can see
 * everything the component DOES and nothing about how it is CALLED. That is the
 * call-site class CLAUDE.md records against the storefront bio prefill, where
 * fifteen behaviour tests stayed green with the defect fully restored. The
 * instrument that reaches it is a source assertion.
 *
 * The directory card gets the same treatment for the same reason:
 * GymsAndStudiosSection.test.tsx builds its own gym objects, so it cannot see
 * whether fetchGymsAndStudios asked the database for slug and pass_active.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const STOREFRONT_PAGE = path.join(ROOT, 'app', 'storefront', '[id]', 'page.tsx');
const FEATURED_PARTNERS_DAL = path.join(ROOT, 'lib', 'dal', 'featuredPartners.ts');
const GYM_DIRECTORY_DAL = path.join(ROOT, 'lib', 'dal', 'gymDirectory.ts');
const STOREFRONT_DATA = path.join(ROOT, 'app', 'storefront', '[id]', 'useStorefrontData.ts');

function read(file: string): string {
  return fs.readFileSync(file, 'utf-8');
}

/**
 * The props of a JSX element, as written.
 *
 * Walks forward from the tag name tracking brace depth, treating `>` as the
 * tag close only at depth 0. A `[^<>]`-style character class cannot be used
 * here: it terminates on the `>` in `=>`, so the day somebody adds an inline
 * handler this guard would silently read a truncated prop list and pass. That
 * is the regex defect CLAUDE.md records, where a scan reported 2 controls out
 * of 89 for exactly this reason.
 */
function propsOf(src: string, tag: string): string {
  const open = src.indexOf(`<${tag}`);
  expect(open, `nothing renders <${tag}> any more`).toBeGreaterThan(-1);

  let i = open + tag.length + 1;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) break;
    i++;
  }
  expect(i, `<${tag}> is never closed`).toBeLessThan(src.length);
  return src.slice(open, i);
}

/** One prop's expression, or null when the prop is not passed at all. */
function propExpr(props: string, name: string): string | null {
  const at = props.indexOf(`${name}={`);
  if (at === -1) return null;

  let i = at + name.length + 2;
  let depth = 1;
  const start = i;
  while (i < props.length && depth > 0) {
    if (props[i] === '{') depth++;
    else if (props[i] === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return props.slice(start, i).trim();
}

describe('the storefront page hands PassEntryButton the viewer it computed', () => {
  it('mounts PassEntryButton at all', () => {
    expect(read(STOREFRONT_PAGE)).toContain('<PassEntryButton');
  });

  it('passes isOwner, and passes the page own ownership flag rather than a literal', () => {
    const props = propsOf(read(STOREFRONT_PAGE), 'PassEntryButton');
    const expr = propExpr(props, 'isOwner');

    expect(
      expr,
      'isOwner is not passed. The component defaults it to undefined, so the owner of a gym is ' +
        'invited to claim their own free class and nothing anywhere reports it.'
    ).not.toBeNull();

    // Exactly `isOwn`. Not "contains isOwn": `!isOwn` and `isOwn && something`
    // both contain it and both mean something else.
    expect(
      expr,
      `isOwner reads \`${expr}\`. It must be the page own isOwn, which is what the copy-link ` +
        'control already uses. A literal or an inverted expression makes the button appear for ' +
        'exactly the wrong person, and the component cannot tell.'
    ).toBe('isOwn');
  });

  it('isOwn still means what the prop assumes it means', () => {
    // Closes the cheap way to satisfy the test above: rename any always-false
    // variable to isOwn and the assertion passes while the owner sees the
    // button. The prop is only as good as the thing it names.
    expect(read(STOREFRONT_PAGE)).toMatch(/const\s+isOwn\s*=\s*d\.currentUserId\s*===\s*instructorId/);
  });

  it('passes the partner row, so the gate reads columns rather than a precomputed boolean', () => {
    const props = propsOf(read(STOREFRONT_PAGE), 'PassEntryButton');
    const expr = propExpr(props, 'partner');

    expect(expr, 'partner is not passed').not.toBeNull();
    expect(expr).toContain('partnerData');
  });
});

describe('the row the gate reads actually carries pass_active', () => {
  it('the storefront resolves its partner through fetchPartnerByUserId', () => {
    // Pins which select the assertion below is about. If the storefront ever
    // resolves its partner some other way, this fails rather than leaving the
    // next test guarding a function nothing on this screen calls.
    expect(read(STOREFRONT_DATA)).toContain('fetchPartnerByUserId');
  });

  it('every featured_partners select asks for pass_active', () => {
    const src = read(FEATURED_PARTNERS_DAL);
    // Every select against the table, not only the one the storefront happens
    // to use: four functions read this table and any of them can end up behind
    // an entry point. An ungranted or unasked-for column is not an error here,
    // it is a silently absent field.
    const selects = src.match(/'id, user_id, slug, business_name[^']*'/g) ?? [];
    expect(selects.length, 'no featured_partners column list found; this guard has lost its target').toBeGreaterThan(0);

    for (const select of selects) {
      expect(
        select.includes('pass_active'),
        'a featured_partners select does not ask for pass_active. The column arrives undefined, ' +
          'hasClaimablePass() reads that as "no pass", and the entry point disappears with no error.'
      ).toBe(true);
    }
  });

  it('the gym card select asks for slug and pass_active on its own, not through the shared constant', () => {
    const src = read(GYM_DIRECTORY_DAL);
    const select = src.match(/\.select\(`\$\{GYM_IDENTITY_COLUMNS\}[^`]*`\)/)?.[0];
    expect(select, 'fetchGymsAndStudios no longer builds its select from GYM_IDENTITY_COLUMNS').toBeTruthy();
    expect(select).toContain('pass_active');
    expect(select).toContain('slug');
  });

  it('pass_active stays off the shared identity constant', () => {
    // GYM_IDENTITY_COLUMNS is also read by fetchPartnersByIds and
    // fetchPartnersForInstructors, which render affiliation chips and offer no
    // pass. Widening it would make two unrelated reads carry a third feature's
    // columns, and "just add it to the shared one" is the obvious way to make
    // the previous test pass without thinking about who else pays for it.
    const gymVenue = read(path.join(ROOT, 'lib', 'dal', 'gymVenue.ts'));
    const constant = gymVenue.match(/GYM_IDENTITY_COLUMNS\s*=\s*'([^']*)'/)?.[1];
    expect(constant, 'GYM_IDENTITY_COLUMNS is gone or no longer a plain string').toBeTruthy();
    expect(constant).not.toContain('pass_active');
  });
});
