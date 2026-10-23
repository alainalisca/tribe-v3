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
  return stripComments(file, readFileSync(file, 'utf8'));
}

/**
 * sourceWithoutComments for a file whose raw text contains `needle`, and ''
 * for any other, which is never parsed.
 *
 * The parse is what makes a whole-repo scan slow (about half a second for the
 * tree on a quiet machine, several times that on a loaded CI runner, where
 * these guards were timing out at 5s). Removing comments only takes text away,
 * so a file without the needle cannot match a pattern that contains it. The
 * needle must be text every match holds whole, outside any comment: an RPC or
 * table name inside its quotes, say, never text a comment could split.
 */
export function sourceWithoutCommentsIfMentions(file: string, needle: string): string {
  const text = readFileSync(file, 'utf8');
  return text.includes(needle) ? stripComments(file, text) : '';
}

function stripComments(file: string, text: string): string {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  return ts.createPrinter({ removeComments: true }).printFile(source);
}
