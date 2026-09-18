import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import nspell from 'nspell';
import { RULE_CANNOT_DECIDE, LEAVE_UNACCENTED, accentWordPattern, deaccent } from './spanishAccents';

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
 *   e. `language === 'es' ? { ...object... }` -- a ternary returning a whole
 *      TABLE rather than one string, e.g. app/feedback/useFeedback.ts
 *
 * (e) was missed until 2026-09-17 and it is the more instructive hole. Pattern
 * (c) was `/language === 'es'\s*\?\s*'([^']*)'/`, which requires a STRING
 * after the `?` and therefore matched an object literal not at all. Measured
 * when it was found: 254 Spanish strings across 15 files invisible to this
 * guard, three of them violating words the old seed ALREADY contained
 * (`Titulo`, `Descripcion`, `descripcion`). The guard had the rule and could
 * not see the string, which is why "157 strings covered" described the
 * instrument rather than the codebase. Prove each shape with its own mutation.
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

  // (e) language === 'es' ? { ...object... }
  // Brace-depth walking, not a regex: the object contains nested objects and
  // arrow functions, and `[^{}]` cannot span either.
  for (const m of src.matchAll(/language\s*===\s*'es'\s*\?\s*\{/g)) {
    let i = m.index! + m[0].length;
    let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    for (const v of literals(src.slice(m.index! + m[0].length, i))) out.push({ value: v, where: at(m.index!) });
  }

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

/**
 * The Spanish dictionary, loaded once. `dictionary-es` is ESM with a top-level
 * await, so it is imported dynamically; `nspell` is CommonJS.
 *
 * Hunspell with AFFIX EXPANSION, which is the part that matters: a raw word
 * list holds base forms only and would miss `informacion` (affix-derived) and
 * `cuentanos` (a pronoun-suffixed verb), both of which shipped unaccented here.
 */
let spell: ReturnType<typeof nspell>;

/**
 * 30s, not the 5s default. Loading and parsing an 880 KB Hunspell dictionary
 * takes ~500ms on its own, and this suite runs test files concurrently, so the
 * wall-clock cost of this hook is not under its own control. A hook that times
 * out fails the WHOLE FILE and takes every assertion in it with it -- which
 * reads as "the accent guard is broken" rather than "the machine was busy". An
 * intermittently-failing guard is worse than a slow one, because the next
 * person learns to re-run it instead of reading it.
 */
beforeAll(async () => {
  const dictionary = (await import('dictionary-es')).default;
  spell = nspell(dictionary.aff, dictionary.dic);
}, 30_000);

const VOWELS: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú' };

/**
 * Every single-accent variant of a word. Spanish carries AT MOST ONE acute
 * accent per word, so this is one candidate per vowel -- at most six or so,
 * each a cheap `correct()` lookup.
 *
 * Deliberately not nspell's `suggest()`: that returns edit-distance neighbours,
 * so it would also offer real but unrelated words and has to be filtered back
 * down anyway. Generating exactly the accent-only variants encodes the rule
 * being tested ("is some ACCENTING of this word valid Spanish") rather than
 * approximating it with a spelling-correction heuristic.
 */
function accentCandidates(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    const lower = word[i].toLowerCase();
    const accented = VOWELS[lower];
    if (!accented) continue;
    const replacement = word[i] === lower ? accented : accented.toUpperCase();
    out.push(word.slice(0, i) + replacement + word.slice(i + 1));
  }
  return out;
}

/**
 * Word-ish runs in a Spanish string.
 *
 * Every exclusion here is a false positive this rule actually produced on its
 * first run, and all of them were instrument bugs rather than copy bugs:
 *
 *   ${...}   a TEMPLATE-LITERAL INTERPOLATION is code, not copy. Scanning it
 *            reported `max` in "${max} dias" and `current` in
 *            "${current} / ${max} caracteres" -- identifier names, flagged as
 *            Spanish missing an accent. {{...}} was already stripped, ${...}
 *            was not.
 *   \uXXXX   literals() returns RAW SOURCE, so "Pol\u00edtica de uni\u00f3n"
 *            reads as `Pol` + `tica` + `uni`, and `uni` looks like a word
 *            missing an accent. Decode first, or the scanner sees fragments of
 *            words and names them with total confidence.
 *
 * Runs shorter than three letters are dropped: nothing that short is a Spanish
 * word missing an accent, and it removes a class of fragment noise.
 */
function wordsIn(value: string): string[] {
  return (
    decodeEscapes(value)
      .replace(/\{\{[^}]*\}\}/g, ' ')
      .replace(/\$\{[^}]*\}/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/g) ?? []
  );
}

/** Turns \uXXXX and \xXX back into the characters a user actually sees. */
function decodeEscapes(value: string): string {
  return value
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

describe('the dictionary itself', () => {
  /**
   * PROBE THE CORPUS BEFORE TRUSTING IT. `an-array-of-spanish-words` has
   * 636,598 Spanish wordforms and is ASCII-FOLDED -- it contains `busqueda` and
   * not `búsqueda`. Had it shipped here, this guard would have certified the
   * misspelling as correct Spanish, and a mutation reverting `búsqueda` to
   * `busqueda` would have passed. A dictionary that is wrong in the exact
   * dimension you are checking is worse than no dictionary.
   *
   * So: known answers, asserted, before anything is built on top.
   */
  it('contains accented Spanish, which is the whole point', () => {
    for (const w of ['búsqueda', 'más', 'día', 'sesión', 'información', 'corazón', 'recuperación']) {
      expect(spell.correct(w), `${w} should be in the dictionary`).toBe(true);
    }
  });

  it('rejects the unaccented forms of those same words', () => {
    // Both halves are needed. A corpus containing BOTH spellings would make the
    // rule silent rather than wrong, and would look fine on the test above.
    for (const w of ['busqueda', 'dia', 'sesion', 'informacion', 'recuperacion']) {
      expect(spell.correct(w), `${w} should NOT be accepted as Spanish`).toBe(false);
    }
  });

  it('accepts the words the rule cannot decide, so the rule stays silent on them', () => {
    // If the dictionary ever stopped accepting these, the rule would begin
    // flagging them and RULE_CANNOT_DECIDE would be doing two jobs at once.
    for (const w of ['mas', 'mi', 'anos', 'este', 'solo', 'tu', 'veras']) {
      expect(spell.correct(w), `${w} is a real Spanish word`).toBe(true);
    }
  });
});

describe('Spanish accents', () => {
  it('leaves este and solo alone, which the RAE de-accented in 2010', () => {
    // If someone "helpfully" adds these, the guard starts demanding a change
    // that is wrong on 23 strings. Asserted so the exclusion cannot be undone
    // silently.
    for (const w of ['este', 'solo']) {
      expect(Object.keys(RULE_CANNOT_DECIDE)).not.toContain(w);
      expect(LEAVE_UNACCENTED).toContain(w);
    }
  });

  it('keeps anos, the string this whole effort started from', () => {
    // `anos` is valid Spanish and NO dictionary will ever flag it. If this
    // entry is ever deleted on the theory that the dictionary covers it,
    // "Anos de Experiencia" is back on the table. See the comment on the entry.
    expect(RULE_CANNOT_DECIDE.anos).toBe('años');
    expect(spell.correct('anos'), 'the dictionary cannot help here').toBe(true);
  });

  it('the two lists never overlap', () => {
    // A word in both would be simultaneously flagged and exempt, and which one
    // won would depend on evaluation order.
    const both = Object.keys(RULE_CANNOT_DECIDE).filter((w) => (LEAVE_UNACCENTED as readonly string[]).includes(w));
    expect(both, `these words are in both lists: ${both.join(', ')}`).toEqual([]);
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

    const exempt = new Set<string>(LEAVE_UNACCENTED as readonly string[]);

    for (const { value, where } of all) {
      // THE RULE: a word that is not Spanish, but some accenting of it is.
      for (const raw of wordsIn(value)) {
        const word = raw.toLowerCase();
        if (exempt.has(word)) continue;
        if (word in RULE_CANNOT_DECIDE) continue; // handled below, with a decision
        if (deaccent(word) !== word) continue; // already carries an accent
        if (spell.correct(word) || spell.correct(raw)) continue; // real Spanish as written
        const fix = accentCandidates(word).find((c) => spell.correct(c));
        if (fix) {
          offenders.push(`${where}\n      "${value}"\n      -> "${raw}" should be "${fix}"`);
        }
      }

      // THE LIST: words the rule declines, because the bare form is also a real
      // word. The decision is ours, per the comments in spanishAccents.ts.
      for (const [bad, good] of Object.entries(RULE_CANNOT_DECIDE)) {
        if (accentWordPattern(bad).test(value)) {
          offenders.push(`${where}\n      "${value}"\n      -> "${bad}" should be "${good}"`);
        }
      }
    }

    expect(
      offenders,
      `Spanish strings are missing accents.\n\n` +
        offenders.join('\n') +
        `\n\nTwo things flag a string here. The RULE: the word is not valid ` +
        `Spanish and some accenting of it is (nspell + dictionary-es, with ` +
        `affix expansion). The LIST in spanishAccents.ts: words the rule ` +
        `cannot decide because the unaccented form is also a real word -- ` +
        `\`anos\` is the canonical one and no dictionary will ever flag it.\n\n` +
        `Five sources are scanned: messages/es.json, es: table halves, ` +
        `language === 'es' ternaries returning a STRING, ternaries returning an ` +
        `OBJECT, and if (language === 'es') blocks. "Anos de Experiencia" lived ` +
        `in two at once and a single-source fix left half of it shipping; the ` +
        `object-returning shape hid 254 more strings until 2026-09-17.\n`
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
