/**
 * i18n codemod (#14) — find every `language === 'es' ? ES : EN` ternary
 * (single-line, multi-line, AND nested) via the TypeScript AST, classify
 * each as SAFE (auto-migratable) or MANUAL, and — only with --apply —
 * rewrite the SAFE ones to `tI18n('key')` and merge the strings into
 * messages/{en,es}.json.
 *
 * Why AST, not grep: the manual/grep pass missed multi-line and nested
 * ternaries. The AST sees every ConditionalExpression regardless of
 * formatting, so nothing is silently skipped.
 *
 * SAFE  = both branches are plain string / no-substitution template
 *         literals, OR template literals whose interpolations are the
 *         SAME simple identifier/property-access on both sides.
 * MANUAL = data-driven (`x.description.es`), calls, JSX, mismatched
 *          interpolations, reversed condition (`!== 'es'`, `=== 'en'`),
 *          anything not provably a pure UI string.
 *
 * The codemod intentionally does NOT insert the `useTranslations` import
 * or the `const tI18n = useTranslations(ns)` line, and does NOT remove a
 * now-orphaned `language`. Those are per-file judgment done in the guided
 * Phase-B batches (the report says which namespace + lists manual sites).
 * It uses the reserved name `tI18n` so it can never collide with an
 * existing `t` (legacy useLanguage().t, AuthTranslations prop, etc.).
 *
 * Usage:
 *   node scripts/i18n-codemod.mjs            # report only, no writes
 *   node scripts/i18n-codemod.mjs --apply    # rewrite SAFE + write JSON
 *   node scripts/i18n-codemod.mjs --apply --dir app/profile   # scope it
 *
 * Always writes scripts/i18n-codemod-report.json (full inventory).
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const dirArg = (() => {
  const i = process.argv.indexOf('--dir');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// Files that already-centralize copy or are out of scope for the inline
// anti-pattern. The 5 *translations.ts modules are the modules-last pass.
const SKIP = /(\.test\.|\.spec\.|\/node_modules\/|translations\.ts$|Translations\.ts$)/;

/** Recursively collect .ts/.tsx under app/ and components/ (or --dir). */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|)$/.test(e.name) && /\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const scopeDirs = dirArg
  ? [path.join(ROOT, dirArg)]
  : [path.join(ROOT, 'app'), path.join(ROOT, 'components')];
const files = scopeDirs.flatMap((d) => (fs.existsSync(d) ? walk(d) : [])).filter((f) => !SKIP.test(f));

/** namespace from path: strip app|components, drop ext + trailing /page. */
function nsFor(file) {
  let rel = path.relative(ROOT, file).replace(/\\/g, '/');
  rel = rel.replace(/^app\//, '').replace(/^components\//, 'c/');
  rel = rel.replace(/\.(tsx|ts)$/, '');
  const parts = rel.split('/').filter((s) => s && s !== 'page');
  return parts.join('.') || 'misc';
}

const slug = (s) => {
  const words = s
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5);
  if (!words.length) return 'key';
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
};

const isEsLiteral = (n) =>
  (ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))) &&
  n.text === 'es';

/** condition is exactly `language === 'es'` or `'es' === language` */
function isLangEsCond(cond) {
  if (!ts.isBinaryExpression(cond)) return false;
  if (cond.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken) return false;
  const a = cond.left,
    b = cond.right;
  const idEs = (x, y) => ts.isIdentifier(x) && x.text === 'language' && isEsLiteral(y);
  return idEs(a, b) || idEs(b, a);
}

const litText = (n) =>
  ts.isStringLiteral(n) || (ts.isNoSubstitutionTemplateLiteral && ts.isNoSubstitutionTemplateLiteral(n))
    ? n.text
    : null;

/** TemplateExpression -> { text: "...{var}...", vars: {var: exprSrc} } or null */
function templateToMsg(node, src) {
  if (!ts.isTemplateExpression(node)) {
    const t = litText(node);
    return t == null ? null : { text: t, vars: {} };
  }
  let text = node.head.text;
  const vars = {};
  for (const span of node.templateSpans) {
    const e = span.expression;
    let varName;
    if (ts.isIdentifier(e)) varName = e.text;
    else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name)) varName = e.name.text;
    else return null; // complex interpolation -> MANUAL
    const exprSrc = src.slice(e.getStart(), e.getEnd());
    if (vars[varName] && vars[varName] !== exprSrc) varName = varName + '_' + Object.keys(vars).length;
    vars[varName] = exprSrc;
    text += '{' + varName + '}' + span.literal.text;
  }
  return { text, vars };
}

const report = { generatedAt: new Date().toISOString(), totals: { safe: 0, manual: 0, files: 0 }, files: {} };
const enPatch = {};
const esPatch = {};

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes("language === 'es'") && !src.includes("'es' === language")) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const ns = nsFor(file);
  const rel = path.relative(ROOT, file);
  const edits = []; // {start,end,replacement}
  const fileRep = { namespace: ns, safe: [], manual: [] };
  const usedKeys = new Set(Object.keys(enPatch[ns] || {}));

  const visit = (node) => {
    if (ts.isConditionalExpression(node) && isLangEsCond(node.condition)) {
      // condition `language === 'es'` => whenTrue is ES, whenFalse is EN
      const esMsg = templateToMsg(node.whenTrue, src);
      const enMsg = templateToMsg(node.whenFalse, src);
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      if (!esMsg || !enMsg || Object.keys(esMsg.vars).join() !== Object.keys(enMsg.vars).join()) {
        fileRep.manual.push({
          line,
          reason: !esMsg || !enMsg ? 'non-literal branch (data-driven/call/jsx)' : 'interpolation mismatch',
          snippet: src.slice(node.getStart(), Math.min(node.getEnd(), node.getStart() + 120)),
        });
        report.totals.manual++;
      } else {
        let key = slug(enMsg.text);
        let i = 2;
        while (usedKeys.has(key)) key = slug(enMsg.text) + i++;
        usedKeys.add(key);
        (enPatch[ns] ||= {})[key] = enMsg.text;
        (esPatch[ns] ||= {})[key] = esMsg.text;
        const varsSrc = Object.entries(enMsg.vars)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        const repl = varsSrc ? `tI18n('${key}', { ${varsSrc} })` : `tI18n('${key}')`;
        edits.push({ start: node.getStart(), end: node.getEnd(), replacement: repl });
        fileRep.safe.push({ line, key, en: enMsg.text, es: esMsg.text });
        report.totals.safe++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (fileRep.safe.length || fileRep.manual.length) {
    report.files[rel] = fileRep;
    report.totals.files++;
  }

  if (APPLY && edits.length) {
    edits.sort((a, b) => b.start - a.start); // back-to-front so offsets hold
    let out = src;
    for (const e of edits) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
    fs.writeFileSync(file, out);
  }
}

// Merge JSON namespaces (deep, additive — never overwrite existing keys).
function mergePatch(jsonPath, patch) {
  const cur = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  for (const [ns, keys] of Object.entries(patch)) {
    const parts = ns.split('.');
    let node = cur;
    for (const p of parts) node = node[p] ||= {};
    for (const [k, v] of Object.entries(keys)) if (!(k in node)) node[k] = v;
  }
  fs.writeFileSync(jsonPath, JSON.stringify(cur, null, 2) + '\n');
}

fs.writeFileSync(path.join(ROOT, 'scripts/i18n-codemod-report.json'), JSON.stringify(report, null, 2) + '\n');

if (APPLY) {
  mergePatch(path.join(ROOT, 'messages/en.json'), enPatch);
  mergePatch(path.join(ROOT, 'messages/es.json'), esPatch);
}

console.log(
  `${APPLY ? 'APPLIED' : 'REPORT'} — ${report.totals.safe} safe, ${report.totals.manual} manual, ` +
    `${report.totals.files} files. Inventory: scripts/i18n-codemod-report.json` +
    (APPLY ? '\nNext (Phase B per file): add `import { useTranslations }` + `const tI18n = useTranslations(ns)`, clear orphaned `language`, handle MANUAL sites, gate, commit.' : '')
);
