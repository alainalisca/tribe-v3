/**
 * T-AUD19: every screen that renders <BottomNav> must clear it, and must
 * derive that clearance from the one definition rather than guessing a number.
 *
 * WHAT WAS ACTUALLY WRONG. The ticket described a floating Create button and a
 * chat bubble covering content. Neither exists in this build: BottomNav is a
 * single fixed bar and Create is a circular button INSIDE it, raised 24px by
 * `-mt-6`. The obstruction is the nav, and its height is already correct --
 *
 *   --bottom-nav-h: calc(4rem + max(env(safe-area-inset-bottom, 0px), 34px))
 *
 * -- so the clearance a page needs is that plus the 24px rise:
 *
 *   88px + max(env(safe-area-inset-bottom), 34px)
 *
 * which is 122px on an iPhone home indicator and more on Android gesture nav.
 *
 * 53 OF 55 SCREENS HARDCODED A LITERAL INSTEAD:
 *
 *   pb-32 (128px)  42 screens   cleared by 6px; loses it above a 40px inset
 *   pb-24  (96px)  10 screens   SHORT BY 26px AT EVERY INSET
 *   pb-20  (80px)   1 screen    SHORT BY 42px AT EVERY INSET
 *
 * The eleven pb-24/pb-20 screens were wrong from the day they were written.
 * They are not fallout from viewport-fit=cover starting to resolve the inset;
 * the 34px floor in --bottom-nav-h meant the nav was already 98px tall while
 * the inset read 0. Saying so matters, because the viewport change is recent
 * and would otherwise take the blame for a defect that predates it.
 *
 * A MECHANISM INTRODUCED WITHOUT MIGRATING ITS CALLERS. --bottom-nav-h exists
 * precisely to fix this class of bug -- globals.css records the overlap it was
 * created for, where three places each computed the nav height and one dropped
 * the floor. Two of 55 callers were migrated. So the defect stayed everywhere
 * unmigrated while the definition read as fixed to anyone who looked at it.
 * That is the pattern this guard closes: the fix existed and was half applied.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const SKIP = new Set(['node_modules', '.next', '.git', '.claude', 'scripts']);

/**
 * SCOPED TO THE PAGE ROOT, not to every pb-* in the file. The first version of
 * this guard flagged any `pb-\d+` and immediately reported pb-1, pb-2 and pb-4
 * off cards and list rows -- element spacing that has nothing to do with the
 * nav. Exempting those one by one would have been the wrong repair: the rule
 * is not "no bottom padding anywhere", it is "the element that clears the nav
 * must derive its clearance".
 *
 * The page root is the element carrying `min-h-screen`, which is also exactly
 * the element the 53 migrated screens put `pb-nav` on. Matching on that makes
 * the guard say what it means and leaves ordinary spacing alone.
 */
const ROOT_CLASS = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const PB_LITERAL = /(?:^|\s)((?:sm:|md:|lg:|xl:|2xl:)?pb-\d+)(?=\s|$)/g;

/**
 * Screens allowed to keep a literal, each with the reason. Rot-tested below:
 * an entry that stops offending fails, so a fix deletes its line rather than
 * leaving an exemption nobody can audit.
 */
const ALLOWED: Record<string, string> = {
  'app/storefront/[id]/page.tsx':
    'already derives from --bottom-nav-h in an inline style, including the ' +
    'floating Book CTA; its remaining literal is an lg: desktop variant where ' +
    'no CTA renders. Migrating it would replace a correct derivation with a ' +
    'worse one.',
};

function screensRenderingBottomNav(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) screensRenderingBottomNav(p, acc);
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) {
      const src = fs.readFileSync(p, 'utf8');
      if (/<BottomNav\b/.test(src)) acc.push(path.relative(ROOT, p));
    }
  }
  return acc;
}

/** Literals in real class positions only, not in the prose explaining them. */
function literalsIn(rel: string): string[] {
  const src = fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const out: string[] = [];
  for (const m of src.matchAll(ROOT_CLASS)) {
    const classes = m[1] ?? m[2] ?? m[3] ?? '';
    if (!/\bmin-h-screen\b/.test(classes)) continue;
    for (const p of classes.matchAll(PB_LITERAL)) out.push(p[1]);
  }
  return out;
}

describe('T-AUD19 bottom nav clearance', () => {
  const screens = screensRenderingBottomNav(path.join(ROOT, 'app'));

  it('finds the screens at all, so an empty scan cannot pass', () => {
    expect(screens.length).toBeGreaterThan(40);
  });

  it('no screen rendering BottomNav hardcodes its clearance', () => {
    const offenders: string[] = [];
    for (const rel of screens) {
      if (rel in ALLOWED) continue;
      const found = literalsIn(rel);
      if (found.length) offenders.push(`${rel}  uses ${[...new Set(found)].join(', ')}`);
    }
    expect(
      offenders,
      `These screens render <BottomNav> and hardcode their bottom clearance:\n\n  ` +
        offenders.join('\n  ') +
        `\n\nUse \`pb-nav\`, which is calc(var(--bottom-nav-h) + 1.5rem). A literal ` +
        `cannot track env(safe-area-inset-bottom): pb-24 and pb-20 were short by ` +
        `26px and 42px at EVERY inset, and pb-32 clears by only 6px and fails on ` +
        `any device reporting more than 40px.\n`
    ).toEqual([]);
  });

  it('every exemption still has a literal to exempt', () => {
    const stale: string[] = [];
    for (const rel of Object.keys(ALLOWED)) {
      if (!screens.includes(rel)) stale.push(`${rel} no longer renders BottomNav`);
      else if (literalsIn(rel).length === 0) stale.push(`${rel} no longer has a pb-* literal`);
    }
    expect(stale, `Stale exemptions:\n  ${stale.join('\n  ')}\n`).toEqual([]);
  });

  it('pb-nav derives from the nav height rather than restating a number', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    expect(css).toMatch(/\.pb-nav\s*\{[^}]*var\(--bottom-nav-h\)/);
  });
});
