/**
 * Safe-area insets are read through var(--safe-area-inset-*), never through
 * env(safe-area-inset-*) directly. The only env() reads are the four :root
 * definitions in app/globals.css.
 *
 * WHY. On Android 15+ the app runs edge-to-edge: the WebView draws behind the
 * status bar and the navigation bar. Android's WebView does not report those
 * bars through env(safe-area-inset-*), so Capacitor 8's SystemBars plugin
 * measures them natively and writes them onto <html> as inline custom
 * properties (--safe-area-inset-top/right/bottom/left). An inline property on
 * <html> beats the :root definition, so var() picks up the real Android value.
 * env() never sees it.
 *
 * Until 2026-10-11 nothing in the app read the variables: 37 sites called
 * env() directly, so Android fell back to the iPhone floors (44px top, 34px
 * bottom). A phone with 3-button navigation has a ~48px bar, which put the
 * bottom nav ~14px under the system buttons.
 *
 * On iOS and in every browser nothing changes: the :root definition IS
 * env(safe-area-inset-*, 0px), and Capacitor's iOS runtime does not set these
 * properties, so var() resolves to exactly the env() value it replaced.
 *
 * HOW. Parsed, not grepped (CLAUDE.md: a text search matches prose). TS/TSX is
 * read with the TypeScript compiler and only string and template literal text
 * is checked, which covers className strings, Tailwind arbitrary values and
 * inline style objects while ignoring comments. CSS has its comments stripped
 * first.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'components', 'lib', 'hooks', 'contexts'];
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.worktrees']);
const RAW = /env\(\s*safe-area-inset-(top|right|bottom|left)/;
const DEFINITION =
  /^\s*--safe-area-inset-(top|right|bottom|left)\s*:\s*env\(\s*safe-area-inset-\1\s*,\s*0px\s*\)\s*;?\s*$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Text of every string and template literal in a TS/TSX file. */
function literalTexts(file: string, src: string): string[] {
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))
      out.push(n.text);
    else if (ts.isJsxText(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every raw env(safe-area-inset-*) read in the tree, as "file: snippet". */
export function rawReads(files: string[]): string[] {
  const found: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    if (f.endsWith('.css')) {
      for (const line of stripCssComments(src).split('\n')) {
        if (RAW.test(line) && !DEFINITION.test(line)) found.push(`${rel}: ${line.trim()}`);
      }
    } else {
      for (const t of literalTexts(f, src)) if (RAW.test(t)) found.push(`${rel}: ${t.trim().slice(0, 120)}`);
    }
  }
  return found;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));

describe('safe-area insets go through the CSS variables', () => {
  it('scans a real corpus (the reading step read something)', () => {
    // An empty walk would make the next test pass vacuously.
    expect(files.some((f) => f.endsWith(path.join('app', 'globals.css')))).toBe(true);
    expect(files.filter((f) => f.endsWith('.tsx')).length).toBeGreaterThan(100);
  });

  it('no code reads env(safe-area-inset-*) directly', () => {
    expect(rawReads(files), 'use var(--safe-area-inset-*) so Android 15+ gets the measured bar heights').toEqual([]);
  });

  it('globals.css defines each variable as its env() value, exactly once', () => {
    const css = stripCssComments(readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8'));
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const defs = css.split('\n').filter((l) => new RegExp(`^\\s*--safe-area-inset-${side}\\s*:`).test(l));
      expect(defs, `--safe-area-inset-${side}`).toHaveLength(1);
      // Without this definition every var() falls back to 0px on iOS and the
      // web, which is worse than the env() it replaced.
      expect(defs[0]).toMatch(DEFINITION);
    }
  });

  it('the detector flags each source shape it is meant to catch, and ignores comments', () => {
    const dir = path.join(ROOT, 'lib', '__tests__');
    const probe = (name: string, body: string) => {
      const f = path.join(dir, name);
      // literalTexts reads from the string passed, so nothing is written to disk
      return f.endsWith('.css')
        ? stripCssComments(body)
            .split('\n')
            .some((l) => RAW.test(l) && !DEFINITION.test(l))
        : literalTexts(f, body).some((t) => RAW.test(t));
    };
    expect(probe('a.tsx', `<div className="pt-[env(safe-area-inset-top)]" />`)).toBe(true);
    expect(probe('b.tsx', `const s = { paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' };`)).toBe(true);
    expect(probe('c.tsx', 'const c = `top-[calc(env(safe-area-inset-top,0px)+${x})]`;')).toBe(true);
    expect(probe('d.css', `.x { padding-left: env(safe-area-inset-left, 0px); }`)).toBe(true);
    expect(probe('e.tsx', `// env(safe-area-inset-top) is 0 in Safari\nconst a = 1;`)).toBe(false);
    expect(probe('f.css', `/* env(safe-area-inset-top) */ .x { color: red; }`)).toBe(false);
    expect(probe('g.css', `  --safe-area-inset-top: env(safe-area-inset-top, 0px);`)).toBe(false);
    expect(probe('h.tsx', `<div className="pt-[var(--safe-area-inset-top)]" />`)).toBe(false);
  });
});
