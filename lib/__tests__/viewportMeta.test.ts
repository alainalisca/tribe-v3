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

  it('NO file hand-writes a viewport meta, which would produce a second tag', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const src = stripComments(fs.readFileSync(file, 'utf8'));
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
});
