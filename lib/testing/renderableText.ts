/**
 * Every piece of text in a TS/TSX source that can reach the screen: string
 * literals, template text and JSX text. Comments are never returned, so prose
 * describing a pattern cannot trip a guard that searches for it.
 *
 * Shared by app/publicContactAddress.test.ts and app/publicHostInCopy.test.ts.
 * It lives here, not in either test, because importing from a .test.ts file
 * registers that file's tests a second time under the importer.
 */
import ts from 'typescript';

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
