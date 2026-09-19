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

/**
 * Unambiguously Spanish function words. Shared-with-English forms (a, no, si,
 * es, o, y, en, un) are excluded on purpose: they are what would let an English
 * sentence in, and an English sentence in this shape is a false positive that
 * costs a real exemption to silence.
 */
const SPANISH_MARKERS = new Set(
  (
    'el la los las del al se su sus tu tus te lo que con para por más mas muy ya pero como ' +
    'cuando donde todo todos toda todas algo nada mal tuyo una unas unos está están estan ' +
    'estar tiene hay este esta esto eso esa ese nos nuestro sin sobre desde hasta aquí aqui'
  ).split(' ')
);

/**
 * True when a marker-free text node is Spanish. Requires TWO markers rather
 * than one, because a single shared word ("la", "no") appears in English copy
 * often enough to matter. An accented character or Spanish punctuation settles
 * it on its own, since neither occurs in this codebase's English.
 */
function looksSpanish(text: string): boolean {
  if (/[¿¡áéíóúüñÁÉÍÓÚÜÑ]/.test(text)) return true;
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? [];
  if (words.length < 3) return false;
  return words.filter((w) => SPANISH_MARKERS.has(w)).length >= 2;
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

  // (f) SPANISH WITH NO `es` MARKER AT ALL.
  //
  // Every shape above keys on an `es` marker: an `es:` property, a
  // `language === 'es'` test, a `...Es` export. app/global-error.tsx has none.
  // It cannot: it renders when the layout tree is broken, so the language
  // provider may be the thing that died, and it prints BOTH languages as
  // sibling JSX nodes rather than choosing one.
  //
  //     <h2>Something went wrong</h2>
  //     <h2>Algo salio mal</h2>
  //
  // The guard passed 8 of 8 over `salio` and `estan` for as long as they
  // existed, because it was looking for a marker that is deliberately absent.
  // This is the whole family in one line: a guard that tests conformance to a
  // shape is blind to exactly the non-conforming instance it exists to catch.
  //
  // So this shape reads TEXT rather than markers, and lets the accent rule do
  // the deciding. Two sources, both marker-free:
  //   - JSX text nodes, the run between `>` and `<` with no braces or tags
  //   - `{es ? '...' : '...'}`, a local-variable shorthand used in 7 files
  //     that `language === 'es'` never matches
  //
  // A JSX text node carries no marker saying which language it is, so this
  // shape has to decide. The first version of it did not, on the reasoning that
  // the accent rule is self-limiting -- a word only flags if dictionary-es
  // rejects it AND some accenting of it is accepted, which English should not
  // reach. MEASURED, AND WRONG: it flagged Record -> récord, continue ->
  // continúe, max -> máx, value -> valúe and num -> núm off English JSX. Those
  // are not exemptions to add; putting them in LEAVE_UNACCENTED would blind the
  // other five shapes to real Spanish. The discriminator belongs here.
  //
  // So a text node is read as Spanish only on TWO unambiguous markers, and
  // ambiguity is resolved against including it. Words shared with English (a,
  // no, si, es, o, y, en, un) are deliberately NOT markers.
  for (const m of src.matchAll(/>([^<>{}]{3,})</g)) {
    const text = m[1].trim();
    if (text && looksSpanish(text)) out.push({ value: text, where: at(m.index!) });
  }
  for (const m of src.matchAll(/es\s*\?\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1/g))
    out.push({ value: m[2], where: at(m.index!) });

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

/**
 * THE BOTH-WAYS DISCRIMINATOR.
 *
 * WHY THIS ARM EXISTS, AND WHY IT MATTERS MORE THAN THE RULE ABOVE. Measured
 * over the whole Spanish corpus on 2026-09-19: 4,354 strings, 2,088 distinct
 * unaccented words.
 *
 *   words the RULE can decide (dictionary-es rejects the bare form) ......... 3
 *   words in its BLIND ZONE (dictionary accepts bare AND accented) ........ 174
 *   of those, covered by the hand lists .................................... 11
 *
 * The rule discriminates THREE words in the entire corpus. It is not the
 * mechanism and never was; the hand list is, and it had been growing one
 * discovery at a time without anyone knowing what it was carrying.
 *
 * 163 uncovered is not 163 defects. Most are `abajo`/`abajó`, `caso`/`casó`:
 * the bare form is right and the accented form is a preterite that never
 * appears in UI copy. Judging those one by one is a Spanish review, not a test.
 *
 * So this arm asks a question the corpus can answer by itself: DOES TRIBE
 * WRITE THIS WORD BOTH WAYS? A word spelled two ways in one product is
 * self-contradicting evidence rather than an opinion about Spanish. It found
 * ten pairs, five of them real defects, with no judgement required.
 *
 * THE PREDICATE NEEDED REFINING, THOUGH, AND HONESTLY SO. "Contradicts itself"
 * is not the same as "appears both ways": `estas` and `estás` are DIFFERENT
 * WORDS -- "these" and "you are" -- and a product using both is correct, not
 * inconsistent. Five of the ten pairs are that. So this arm still needs a hand
 * list, and the honest claim is narrower than "no hand list": it is that
 * HOMOGRAPHS is a better list to maintain than the alternative. It holds real
 * facts about Spanish rather than guesses at Tribe's intent, it only needs an
 * entry when both spellings actually ship, and it is bounded by usage instead
 * of by the dictionary's ambiguity -- six entries against 163 candidates.
 */
const HOMOGRAPHS: Record<string, string> = {
  // The interrogative/exclamative accent. Spanish accents these words when they
  // ASK and leaves them bare when they connect, so a product that uses both is
  // correct, and one that uses only one of them is the suspicious case.
  cuando: 'cuándo', // "cuando llegues" vs "¿cuándo?"
  que: 'qué', // "la sesión que elegiste" vs "¿qué pasó?"
  como: 'cómo', // "como anfitrión" vs "¿cómo funciona?"
  cual: 'cuál', // "el cual" vs "¿cuál?"
  donde: 'dónde', // "donde entrenas" vs "¿dónde?"
  quien: 'quién', // "quien reserve" vs "¿quién?"

  // Different words, not different registers.
  esta: 'está', // "esta sesión" (this) vs "está llena" (it is)
  este: 'esté', // "este mes" (this) vs "cuando esté listo" (subjunctive)
  estas: 'estás', // "estas recomendaciones" (these) vs "estás en peligro" (you are)
  aun: 'aún', // "aun así" (even) vs "aún no" (yet)

  // Noun versus third-person preterite. Both forms are used and both correct.
  pago: 'pagó', // "el pago" (the payment) vs "pagó" (they paid)
  paso: 'pasó', // "el paso" (the step) vs "pasó" (it happened)
  cambio: 'cambió', // "el cambio" (the change) vs "cambió" (it changed)
  cuanto: 'cuánto', // "en cuanto" (as soon as) takes no accent; "¿cuánto?" does
  publica: 'pública', // "se publica" (is published) vs "página pública"
};

/**
 * AN EXEMPTION IS A BLIND SPOT, AND THIS ONE HAS A KNOWN COST. Listing `esta`
 * as a homograph is correct -- both forms are real and Tribe needs both -- but
 * it means this arm cannot see "Tu tribu esta entrenando sin ti", which is a
 * genuine missing accent in lib/motivationalMessageData.ts. It is on Ana's pile
 * with the rest rather than being silently covered by the entry above.
 *
 * Every entry in HOMOGRAPHS buys a blind spot of exactly this shape. Add one
 * only when both forms genuinely ship, and say in the comment what it costs.
 */
/**
 * Defects this arm found that are Spanish COPY, so they go to Ana rather than
 * being corrected on Claude's judgement -- the same rule as escaparate/vitrina.
 * Listed, not exempted: the second test below fails if an entry stops
 * offending, so a fix must delete its line rather than leave a stale exemption.
 *
 * `estas` is NOT here. That one string was fixed immediately; see
 * app/legal/legalTranslations.ts for why.
 */
const AWAITING_SPANISH_REVIEW: Record<string, string> = {
  // NOT LISTED, AND THE REASON IS THE ARM'S LIMIT: "Tu viaje fitness continua."
  // (-> continúa, lib/motivationalMessageData.ts) is a real defect that this
  // arm CANNOT see, because `continúa` never appears anywhere in the corpus --
  // there is no contradiction to detect when only the wrong spelling ships.
  // It went to Ana as copy. This arm finds the words Tribe disagrees with
  // itself about; it is not a substitute for reading the Spanish.
  genero: '"Filtrar por genero" -> género (lib/translationBase.ts)',
  unete: '"Vuelve y unete!" x3 -> únete, an imperative that ALWAYS carries it (lib/motivationalMessageData.ts)',
  invalida: '"Invitación invalida" -> inválida (lib/translationExtras.ts)',
  revisara: '"Un admin la revisara." -> revisará (recapPhotosHelpers.ts, translationExtras.ts)',
  veras: '"veras sus solicitudes aquí" -> verás (you will see)',
  sera: '"Tu información sera compartida" -> será',
  expiro: '"Esta invitación ya expiro." -> expiró (hooks/sessionActionTypes.ts:61)',
};

describe('Spanish spelled both ways', () => {
  // Uses the module-level `spell` from the top-level beforeAll above; the
  // dictionary is loaded once for the file, not once per describe.
  function pairsInCorpus(): Map<string, string[]> {
    const all = flattenJson(JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/es.json'), 'utf8')));
    for (const file of sourceFiles(ROOT)) {
      const rel = path.relative(ROOT, file);
      // THE GUARD'S OWN VOCABULARY IS NOT TRIBE'S COPY. spanishAccents.ts holds
      // LEAVE_UNACCENTED and RULE_CANNOT_DECIDE, which are lists of the exact
      // unaccented forms this file exists to reason about. Scanning it made the
      // arm read its own exemption list as product text: `unete` lives there,
      // so the pair `unete`/`únete` stayed flagged even after every real use of
      // it was corrected, and the arm was reporting on itself.
      //
      // Caught only because a revert test fixed all three real occurrences and
      // the flag did not clear. stripComments does not help here: these are
      // string literals in code, not prose.
      if (rel === path.join('lib', 'i18n', 'spanishAccents.ts')) continue;
      all.push(...spanishStrings(rel, stripComments(fs.readFileSync(file, 'utf8'))));
    }
    const words = new Set<string>();
    for (const { value } of all) for (const w of wordsIn(value)) words.add(w.toLowerCase());

    const pairs = new Map<string, string[]>();
    for (const w of words) {
      if (deaccent(w) !== w) continue; // only bare forms start a pair
      const seen = accentCandidates(w).filter((c) => spell.correct(c) && words.has(c));
      if (seen.length) pairs.set(w, seen);
    }
    return pairs;
  }

  it('no word is spelled two ways unless it is a known homograph', () => {
    const pairs = pairsInCorpus();
    const offenders: string[] = [];
    for (const [bare, accented] of pairs) {
      if (bare in HOMOGRAPHS) continue;
      if (bare in AWAITING_SPANISH_REVIEW) continue;
      offenders.push(`${bare} / ${accented.join(', ')}`);
    }
    expect(
      offenders,
      `These words appear in Tribe's Spanish BOTH accented and unaccented:\n\n  ` +
        offenders.join('\n  ') +
        `\n\nOne of the two spellings is wrong, and the corpus says so without ` +
        `anyone having to judge Spanish. This is the arm that does the work: ` +
        `the accent RULE can only decide 3 words in 2,088, because dictionary-es ` +
        `accepts both spellings of almost everything.\n\nIf both forms are ` +
        `genuinely different words (estas/estás), add them to HOMOGRAPHS with ` +
        `the distinction. If one is a defect in COPY, fix it or list it in ` +
        `AWAITING_SPANISH_REVIEW for Ana.\n`
    ).toEqual([]);
  });

  it('every listed pair still occurs, so no exemption outlives its defect', () => {
    const pairs = pairsInCorpus();
    const stale: string[] = [];
    for (const bare of Object.keys(AWAITING_SPANISH_REVIEW)) {
      if (!pairs.has(bare)) stale.push(`${bare} is no longer spelled both ways (${AWAITING_SPANISH_REVIEW[bare]})`);
    }
    for (const bare of Object.keys(HOMOGRAPHS)) {
      if (!pairs.has(bare)) stale.push(`${bare} is no longer spelled both ways (homograph: ${HOMOGRAPHS[bare]})`);
    }
    expect(
      stale,
      `Stale entries. A fix must DELETE its line rather than leave an exemption ` +
        `behind that no longer describes anything:\n\n  ` +
        stale.join('\n  ') +
        `\n`
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
