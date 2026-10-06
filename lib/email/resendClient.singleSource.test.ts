/**
 * T-AV19 Part B.2. lib/email/resendClient.ts is the ONLY place that may build
 * a Resend client. Every other file goes through it, so log mode cannot be
 * bypassed by a new call site.
 *
 * Parsed, not grepped. The source is read with the TypeScript compiler and the
 * question is asked of the syntax tree, for two reasons CLAUDE.md records:
 * a text search matches prose (a comment explaining this rule would fail it),
 * and a search for a NAME answers "is it spelled that way". So it looks for the
 * capability instead, two ways:
 *
 *   1. any `new Resend(...)` expression
 *   2. any VALUE import of `Resend` from 'resend', whatever local name it is
 *      bound to (`import { Resend as R }` then `new R(...)` is caught here)
 *
 * Type-only imports (`import type { CreateEmailOptions }`) are fine: a type
 * cannot send an email.
 *
 * Test files are excluded, because they mock 'resend' and have to import it.
 *
 * Mutation proof (run by hand, recorded in the T-AV19 report): put
 * `return new Resend(key);` back into lib/email/passLead.ts -> this goes red
 * naming that file.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'lib', 'components', 'hooks', 'contexts', 'scripts'];
const FACTORY = path.join('lib', 'email', 'resendClient.ts');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist']);

/**
 * Files allowed to construct Resend themselves. Each entry carries its reason
 * (CLAUDE.md: an exemption without one cannot be audited), and the rot test
 * below fails the day an entry stops offending, so a fixed file cannot leave a
 * permanent hole behind it.
 */
const KNOWN_DIRECT_CONSTRUCTION: Record<string, string> = {
  [path.join('scripts', 'grant-tribe-os-premium.js')]:
    'Hand-run CommonJS operator CLI, not app runtime; nothing invokes it automatically. It loads .env.local ' +
    '(production keys) by design and `require`s resend directly, so it cannot import the TS factory without a ' +
    'build step. Found by this scan on 2026-09-26, after the T-AV20 recon missed it (the recon grep covered app ' +
    'and lib only). Whether to route it through lib/notify/sendMode is an open decision for Al in the T-AV19 report.',
};

function walk(dir: string, out: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a directory this repo does not have
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

interface Offence {
  file: string;
  line: number;
  what: string;
}

export function findResendConstruction(file: string, src: string): Offence[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const offences: Offence[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Resend') {
      offences.push({ file, line: at(node), what: 'new Resend(...)' });
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'resend' &&
      !node.importClause?.isTypeOnly
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          const imported = (el.propertyName ?? el.name).text;
          if (imported === 'Resend' && !el.isTypeOnly) {
            offences.push({ file, line: at(el), what: `value import of Resend as "${el.name.text}"` });
          }
        }
      }
      if (node.importClause?.name) {
        offences.push({ file, line: at(node), what: 'default import from resend' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return offences;
}

describe('Resend is constructed in exactly one place', () => {
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d), []));

  it('read a real corpus (so a pass is not the empty set agreeing with itself)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(FACTORY))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join('lib', 'email', 'passLead.ts')))).toBe(true);
  });

  it('the factory itself is seen by the detector (the detector can fire)', () => {
    const own = findResendConstruction(FACTORY, readFileSync(path.join(ROOT, FACTORY), 'utf8'));
    expect(own.map((o) => o.what)).toEqual(
      expect.arrayContaining(['new Resend(...)', 'value import of Resend as "Resend"'])
    );
  });

  it('no other file constructs or value-imports Resend', () => {
    const offences = files
      .filter((f) => !f.endsWith(FACTORY))
      .filter((f) => !(path.relative(ROOT, f) in KNOWN_DIRECT_CONSTRUCTION))
      .flatMap((f) => findResendConstruction(path.relative(ROOT, f), readFileSync(f, 'utf8')));
    expect(offences.map((o) => `${o.file}:${o.line} ${o.what}`)).toEqual([]);
  });

  it('every exemption still offends and says why (remove it once it is fixed)', () => {
    for (const [rel, reason] of Object.entries(KNOWN_DIRECT_CONSTRUCTION)) {
      expect(reason.length, `${rel} has no reason`).toBeGreaterThan(40);
      const offences = findResendConstruction(rel, readFileSync(path.join(ROOT, rel), 'utf8'));
      expect(offences.length, `${rel} no longer constructs Resend; delete its exemption`).toBeGreaterThan(0);
    }
  });

  it('catches the renamed-import route and ignores prose and type-only imports', () => {
    const src = [
      "import { Resend as Mailer } from 'resend';",
      "import type { CreateEmailOptions } from 'resend';",
      '// new Resend(key) in a comment is prose',
      "const s = 'new Resend(key)';",
      'const m = new Mailer(k);',
    ].join('\n');
    expect(findResendConstruction('x.ts', src).map((o) => o.what)).toEqual(['value import of Resend as "Mailer"']);
  });
});
