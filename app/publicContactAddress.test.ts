/**
 * No page a visitor can open shows the old contact address.
 *
 * WHY. Tribe's email is sent from info@tribelatam.com (lib/email/sender.ts).
 * Until 2026-10-11 the footer, About, the legal pages and the Ley 1581 data
 * policy all told people to write to tribe@aplusfitnessllc.com instead, so a
 * visitor saw one address in their inbox and a different company's domain on
 * the site. This keeps the old address from coming back to any rendered surface.
 *
 * SCOPE, BY DIRECTORY, NOT BY ALLOW-LIST. Everything under app/ and components/
 * is scanned except app/api/, where the old address is still the ADMIN
 * RECIPIENT of internal alerts (new sign-ups, feedback). Those are delivered to
 * the owner, never shown to a visitor, so they are out of scope rather than
 * exempted. lib/ is not scanned for the same reason: its only uses are admin
 * recipients and the admin allow-list.
 *
 * HOW. Parses each file with the TypeScript compiler and reads only string
 * literals, template text and JSX text: what can reach the screen. Comments are
 * never read, so a comment recording the history of the change (content.ts has
 * one) cannot trip it.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const ROOT = path.join(__dirname, '..');
const OLD = 'aplusfitnessllc';

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === path.join(ROOT, 'app', 'api') || entry.name === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every piece of text in `src` that can render: string literals, template text, JSX text. */
export function renderableText(fileName: string, src: string): string[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('visitor-facing pages show info@tribelatam.com, never the old address', () => {
  const files = [path.join(ROOT, 'app'), path.join(ROOT, 'components')].flatMap((d) => sourceFiles(d));
  const textOf = (f: string): string[] => renderableText(f, fs.readFileSync(f, 'utf-8'));

  it('read a real corpus, and reads the new address where it is known to be', () => {
    // A scanner that reads nothing passes the next test forever.
    expect(files.length).toBeGreaterThan(300);
    const footer = path.join(ROOT, 'components', 'marketing', 'MarketingLayout.tsx');
    expect(textOf(footer).join('\n')).toContain('info@tribelatam.com');
  });

  it(`no rendered string under app/ (outside app/api) or components/ contains "${OLD}"`, () => {
    const offenders = files.filter((f) => textOf(f).some((t) => t.includes(OLD)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  describe('the detector', () => {
    it('sees the address in a string, a JSX text node and a template', () => {
      const src = [
        "const a = 'tribe@aplusfitnessllc.com';",
        'const b = <a href="mailto:x">tribe@aplusfitnessllc.com</a>;',
        'const c = `write to tribe@aplusfitnessllc.com ${x}`;',
      ].join('\n');
      expect(renderableText('x.tsx', src).filter((t) => t.includes(OLD))).toHaveLength(3);
    });

    it('does not read comments', () => {
      const src = "// was tribe@aplusfitnessllc.com\n/* tribe@aplusfitnessllc.com */\nconst a = 'ok';";
      expect(renderableText('x.tsx', src).some((t) => t.includes(OLD))).toBe(false);
    });
  });
});
