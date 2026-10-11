/**
 * Tribe's sender address lives in ONE place: lib/email/sender.ts.
 *
 * It was hard-coded in 17 places until 2026-10-10. Copies drift: the next one
 * written by hand is the one still on the old domain, and nothing notices until
 * a stranger gets an email from an address they have never heard of, or it
 * bounces because the domain is not verified in Resend.
 *
 * The scan parses each file with the TypeScript compiler and inspects string
 * literals, so a comment that mentions an address is not a hit and a
 * multi-line call cannot hide one. It flags two shapes:
 *   - a display-name address in a string, "Name <x@y>", the shape of a `from`;
 *   - a `from:` property whose value is a string literal containing "@".
 * Recipient addresses (ADMIN_EMAIL = 'x@y') are neither shape and are allowed.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { TRIBE_FROM, TRIBE_FEEDBACK_FROM, TRIBE_SENDER_ADDRESS } from './sender';

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'lib', 'components', 'hooks', 'contexts', 'supabase/functions'];
const SKIP = new Set(['node_modules', '.next', 'out']);
const OWNER = path.join(ROOT, 'lib', 'email', 'sender.ts');

function files(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const DISPLAY_NAME_ADDRESS = /<[^<>\s@]+@[^<>\s]+>/;

/** Line numbers of hard-coded sender addresses in `text`. */
export function hardcodedSenders(fileName: string, text: string): number[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: number[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && DISPLAY_NAME_ADDRESS.test(node.text)) hits.push(line(node));
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'from' &&
      ts.isStringLiteralLike(node.initializer) &&
      node.initializer.text.includes('@') &&
      !DISPLAY_NAME_ADDRESS.test(node.initializer.text)
    ) {
      hits.push(line(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('the sender address has one home (lib/email/sender.ts)', () => {
  const corpus = SCAN_DIRS.flatMap((d) => files(path.join(ROOT, d))).filter((f) => f !== OWNER);

  it('read a real corpus', () => {
    expect(corpus.length).toBeGreaterThan(300);
    expect(corpus.some((f) => f.endsWith(path.join('lib', 'email', 'passLead.ts')))).toBe(true);
  });

  it('no other file hard-codes a sender address', () => {
    const offenders = corpus.flatMap((f) =>
      hardcodedSenders(f, fs.readFileSync(f, 'utf-8')).map((l) => `${path.relative(ROOT, f)}:${l}`)
    );
    expect(offenders, 'Import TRIBE_FROM / TRIBE_FEEDBACK_FROM from @/lib/email/sender instead.').toEqual([]);
  });

  it('sends from the verified tribelatam.com domain, as "Tribe"', () => {
    expect(TRIBE_SENDER_ADDRESS).toBe('info@tribelatam.com');
    expect(TRIBE_FROM).toBe('Tribe <info@tribelatam.com>');
    expect(TRIBE_FEEDBACK_FROM).toBe('Tribe Feedback <info@tribelatam.com>');
  });

  describe('the detector objects to known offenders', () => {
    it('the old line, and a display name inside a template', () => {
      expect(hardcodedSenders('x.ts', "const FROM = 'Tribe <tribe@aplusfitnessllc.com>';")).toEqual([1]);
      expect(hardcodedSenders('x.ts', 'const f = `Tribe <${a}@x.com>`;')).toEqual([]);
      expect(hardcodedSenders('x.ts', "await r.emails.send({\n  to,\n  from: 'Ops <ops@x.com>',\n});")).toEqual([3]);
    });

    it('a bare address in a from: property', () => {
      expect(hardcodedSenders('x.ts', "send({ from: 'tribe@x.com', to })")).toEqual([1]);
    });

    it('but not a recipient, a comment, or a from: built from the constant', () => {
      const src = [
        "const ADMIN_EMAIL = 'tribe@aplusfitnessllc.com';",
        "// from: 'Tribe <tribe@aplusfitnessllc.com>'",
        'send({ from: TRIBE_FROM, to: ADMIN_EMAIL });',
      ].join('\n');
      expect(hardcodedSenders('x.ts', src)).toEqual([]);
    });
  });
});
