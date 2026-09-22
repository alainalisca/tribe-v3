import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * T-AUD6: exactly ONE viewport tag must reach the page.
 *
 * Production emitted two, measured on the deployed HTML: the hand-written
 * <meta> at byte offset 148 and Next's own default at 237. Only one exists in
 * source, because a raw tag in <head> DOES NOT SUPPRESS Next's default -- the
 * App Router emits `width=device-width, initial-scale=1` whenever the `viewport`
 * export is absent.
 *
 * The second tag carries no viewport-fit, and that is the part that matters:
 * without viewport-fit=cover every env(safe-area-inset-*) resolves to 0, so the
 * 66 fixed/sticky headers that DO handle the safe area fall back to their 44px
 * floor -- less than an iPhone notch inset. Headers under the status bar is not
 * missing padding; it is correct padding measured against a zero inset.
 *
 * WHY A SOURCE GUARD RATHER THAN AN ASSERTION ON RENDERED HTML: the duplicate is
 * produced by the framework at render time, from the ABSENCE of an export. There
 * is nothing to render in a unit test that would show it. What can be asserted
 * is the contract that produces one tag, and that contract is exactly what the
 * next person will break by adding a <meta> by hand.
 */

const ROOT = path.resolve(__dirname, '../..');
const LAYOUT = path.join(ROOT, 'app/layout.tsx');

/** Comments describe the defect; they are not the defect. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', '.claude'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe('viewport meta', () => {
  it('app/layout.tsx exports a viewport, so Next does not emit its own default', () => {
    const src = stripComments(fs.readFileSync(LAYOUT, 'utf8'));
    expect(src).toMatch(/export const viewport\s*:\s*Viewport\s*=/);
  });

  it('that export sets viewport-fit: cover, or every safe-area inset resolves to 0', () => {
    const src = stripComments(fs.readFileSync(LAYOUT, 'utf8'));
    const block = src.slice(src.indexOf('export const viewport'));
    const body = block.slice(0, block.indexOf('};') + 1);

    expect(body).toMatch(/viewportFit\s*:\s*'cover'/);
    expect(body).toMatch(/width\s*:\s*'device-width'/);
    expect(body).toMatch(/initialScale\s*:\s*1/);
  });

  /**
   * A file that emits its own COMPLETE document is not in this rule's
   * population, and the reason is the rule's own reasoning.
   *
   * The defect is that a hand-written <meta> does not REPLACE Next's default,
   * it ADDS to it. That only happens where Next builds the document. A route
   * handler returning `new NextResponse('<!doctype html>...')` bypasses the
   * App Router document entirely -- app/layout.tsx never runs, no default tag
   * is emitted, and there is nothing to duplicate. Requiring those files to
   * omit a viewport would make them render unscaled on a phone to satisfy a
   * rule about a tag that is not there. /api/unsubscribe is one: it is clicked
   * from an inbox, mostly on a phone, and it is the only way anyone has to
   * stop receiving email.
   *
   * Detected by the doctype rather than by a path allow-list, deliberately. A
   * list of filenames goes stale silently and needs a rot test to stay honest;
   * "does this file emit a whole document" is the actual distinguishing
   * property and cannot drift out of date. No page or component contains a
   * doctype, so nothing in the real population is exempted by it.
   */
  const emitsOwnDocument = (src: string) => /<!doctype html/i.test(src);

  it('NO file hand-writes a viewport meta, which would produce a second tag', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (emitsOwnDocument(src)) continue;
      // Both the JSX form and a raw string, since either reaches the document.
      for (const m of src.matchAll(/name=["']viewport["']/g)) {
        const line = src.slice(0, m.index!).split('\n').length;
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }

    expect(
      offenders,
      `A hand-written <meta name="viewport"> does NOT replace Next's default -- ` +
        `it ADDS to it, and the page ends up with two. Set it in the \`viewport\` ` +
        `export in app/layout.tsx instead:\n\n` +
        offenders.join('\n') +
        `\n`
    ).toEqual([]);
  });

  /**
   * ASSERT THE EXEMPTION, NOT JUST THE RULE. A narrowing that quietly matched
   * everything would make the case above pass forever over an empty set --
   * and it would look exactly like a clean repo.
   */
  it('the doctype narrowing still leaves the real population under the rule', () => {
    const all = sourceFiles(ROOT).map((f) => stripComments(fs.readFileSync(f, 'utf8')));
    const exempt = all.filter(emitsOwnDocument);
    const covered = all.length - exempt.length;

    // It applies to something real...
    expect(exempt.length).toBeGreaterThan(0);
    // ...and to almost nothing. Every page and component is still checked.
    expect(covered).toBeGreaterThan(300);
    expect(exempt.length).toBeLessThan(covered / 20);
  });

  it('a file with no doctype is still caught', () => {
    // The rule itself, exercised on a synthetic offender, so "no offenders"
    // cannot mean "the detector stopped looking".
    const pageLike = 'export default () => <meta name="viewport" content="width=device-width" />;';
    expect(emitsOwnDocument(pageLike)).toBe(false);
    expect([...pageLike.matchAll(/name=["']viewport["']/g)]).toHaveLength(1);
  });
});
