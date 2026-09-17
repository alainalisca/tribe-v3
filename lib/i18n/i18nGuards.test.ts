import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REQUIRES_ACCENT, DELIBERATELY_EXCLUDED, accentWordPattern } from './spanishAccents';

/**
 * Two guards that share a home because they are the same shape: both scan the
 * source tree and assert a property no unit test can see.
 *
 *   1. Every literal translation key resolves. useTranslations falls through to
 *      `?? key`, so an unresolved lookup RENDERS THE KEY and looks deliberate.
 *   2. No Spanish string is missing an accent it must carry.
 *
 * WHY THE ACCENT GUARD SCANS FOUR SOURCES AND NOT JUST messages/es.json.
 * "Anos de Experiencia" was reported on 2026-09-14 and survived, because the
 * same string exists independently in components/InstructorCard.tsx AND in
 * messages/es.json. A guard covering one source would have reproduced exactly
 * that failure. Spanish copy lives in:
 *   a. messages/es.json
 *   b. the `es:` half of bilingual tables (translationBase, translationExtras,
 *      sportTranslationData, motivationalMessageData, sports)
 *   c. inline `language === 'es' ? '...'` ternaries, in ~20 components
 *   d. `if (language === 'es')` blocks, e.g. app/legal/legalTranslations.ts
 */

const ROOT = path.resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.claude', 'scripts']);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

/**
 * Strip comments before scanning.
 *
 * Not cosmetic: the fix for T-AUD3 documents the broken call as
 * `t('fields.photo')` INSIDE A COMMENT, and the key guard flagged its own
 * explanation as a live defect. A scanner that reads prose it cannot execute
 * reports the wrong thing with total confidence -- the same family as a check
 * matching a phrase its author's own comment contains (migration 165).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Every quoted literal in a chunk of source, including template literals. */
function literals(src: string): string[] {
  return [...src.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2]);
}

/** The Spanish-bearing regions of one file, per (b), (c) and (d) above. */
function spanishStrings(rel: string, src: string): { value: string; where: string }[] {
  const out: { value: string; where: string }[] = [];
  const at = (i: number) => `${rel}:${src.slice(0, i).split('\n').length}`;

  // (b) es: '...'  and  es: { ... }, brace-matched so {{placeholders}} do not truncate it
  for (const m of src.matchAll(/\bes:\s*'([^']*)'/g)) out.push({ value: m[1], where: at(m.index!) });
  for (const m of src.matchAll(/\bes:\s*\{/g)) {
    let i = m.index! + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    for (const v of literals(src.slice(m.index!, i))) out.push({ value: v, where: at(m.index!) });
  }

  // (b2) export const <something>Es = { ... } -- lib/translationBase.ts and
  // lib/translationExtras.ts put their Spanish in a NAMED EXPORT, not under an
  // `es:` property, so pattern (b) above does not see them. A mutation run
  // proved it: reverting an accent in baseEs failed nothing until this existed.
  for (const m of src.matchAll(/export const \w*Es\b/g)) {
    const open = src.indexOf('{', m.index!);
    if (open === -1) continue;
    let i = open + 1;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    for (const v of literals(src.slice(open, i))) out.push({ value: v, where: at(m.index!) });
  }

  // (c) language === 'es' ? '...'
  for (const m of src.matchAll(/language\s*===\s*'es'\s*\?\s*'([^']*)'/g))
    out.push({ value: m[1], where: at(m.index!) });

  // (d) if (language === 'es') { ... }
  for (const m of src.matchAll(/if \(language === 'es'\) \{/g)) {
    let i = m.index! + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    for (const v of literals(src.slice(m.index!, i))) out.push({ value: v, where: at(m.index!) });
  }
  return out;
}

function flattenJson(obj: unknown, prefix = '', acc: { value: string; where: string }[] = []) {
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string') acc.push({ value: v, where: `messages/es.json: ${prefix}${k}` });
    else if (v && typeof v === 'object') flattenJson(v, `${prefix}${k}.`, acc);
  }
  return acc;
}

describe('Spanish accents', () => {
  it('excludes este and solo, which the RAE de-accented in 2010', () => {
    // If someone "helpfully" adds these, the guard starts demanding a change
    // that is wrong on 23 strings. Asserted so the exclusion cannot be undone
    // silently.
    for (const w of ['este', 'solo']) {
      expect(Object.keys(REQUIRES_ACCENT)).not.toContain(w);
      expect(DELIBERATELY_EXCLUDED).toContain(w);
    }
  });

  it('no Spanish string is missing an accent it must carry, in ANY of the four sources', () => {
    const offenders: string[] = [];

    // (a) messages/es.json
    const es = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/es.json'), 'utf8'));
    const all = flattenJson(es);

    // (b) (c) (d) the source tree
    for (const file of sourceFiles(ROOT)) {
      const rel = path.relative(ROOT, file);
      all.push(...spanishStrings(rel, stripComments(fs.readFileSync(file, 'utf8'))));
    }

    for (const { value, where } of all) {
      for (const [bad, good] of Object.entries(REQUIRES_ACCENT)) {
        if (accentWordPattern(bad).test(value)) {
          offenders.push(`${where}\n      "${value}"\n      -> "${bad}" should be "${good}"`);
        }
      }
    }

    expect(
      offenders,
      `Spanish strings are missing accents.\n\n` +
        offenders.join('\n') +
        `\n\nThis guard covers messages/es.json, es: table halves, ` +
        `language === 'es' ternaries and if (language === 'es') blocks -- ` +
        `because "Anos de Experiencia" lived in two of them at once and a ` +
        `single-source fix left half of it shipping.\n`
    ).toEqual([]);
  });
});

describe('translation keys resolve', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8'));

  function namespaceOf(ns: string): Record<string, unknown> | undefined {
    let node: unknown = en;
    for (const part of ns.split('.')) {
      if (typeof node !== 'object' || node === null) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'object' && node !== null ? (node as Record<string, unknown>) : undefined;
  }

  it('every literal useTranslations key resolves to a string', () => {
    const unresolved: string[] = [];

    for (const file of sourceFiles(ROOT)) {
      const rel = path.relative(ROOT, file);
      if (rel === path.join('lib', 'i18n', 'useTranslations.ts')) continue; // its own JSDoc examples
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      if (!src.includes('useTranslations(')) continue;

      for (const decl of src.matchAll(/const\s+(\w+)\s*=\s*useTranslations\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const [, alias, ns] = decl;
        const nsObj = namespaceOf(ns);
        const callRe = new RegExp(`\\b${alias}\\(\\s*(['"\`])([^'"\`]+)\\1`, 'g');
        for (const call of src.matchAll(callRe)) {
          const key = call[2];
          if (key.includes('${')) {
            // A template key cannot be resolved statically -- but if its STATIC
            // PREFIX contains a dot, it is a dotted key and can never resolve,
            // because the lookup inside a namespace is flat. This is the exact
            // shape of T-AUD3, `t(`fields.${field}`)`, and skipping it entirely
            // meant the guard could not catch the bug it was written for. Proved
            // by mutation.
            if (key.slice(0, key.indexOf('${')).includes('.')) {
              const line = src.slice(0, call.index!).split('\n').length;
              unresolved.push(
                `${rel}:${line}  useTranslations('${ns}') -> t(\`${key}\`)  [dotted key in a template literal]`
              );
            }
            continue;
          }
          if (!nsObj || typeof nsObj[key] !== 'string') {
            const line = src.slice(0, call.index!).split('\n').length;
            unresolved.push(`${rel}:${line}  useTranslations('${ns}') -> t('${key}')`);
          }
        }
      }
    }

    expect(
      unresolved,
      `These keys do not resolve in messages/en.json, so useTranslations falls ` +
        `through to \`?? key\` and RENDERS THE KEY ITSELF -- which looks like ` +
        `deliberate copy at runtime (T-AUD3):\n\n` +
        unresolved.join('\n') +
        `\n\nA nested message is addressed through the NAMESPACE, not a dotted ` +
        `key: useTranslations('instructorIncomplete.fields') then t('photo').\n`
    ).toEqual([]);
  });
});
