/**
 * Test helper: a TypeScript or TSX file's text with every comment removed,
 * using the TypeScript compiler's own scanner (a printer with removeComments).
 *
 * For source-scan guards that must not match their subject's prose. A guard
 * asserting "this file never calls X" reads a file whose header explains that
 * it never calls X; a regex comment stripper is wrong on this repo's own
 * files (CLAUDE.md, the four guards that matched their author's prose), so
 * the stripping is done by the thing that actually parses the language.
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';

export function sourceWithoutComments(file: string): string {
  const text = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}
