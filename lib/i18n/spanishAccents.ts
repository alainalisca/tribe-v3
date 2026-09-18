/**
 * The Spanish-accent guard's decision data.
 *
 * Exported as data rather than inlined in the test so the dev-mode warning and
 * any future tooling read the SAME source. Two lists that drift apart is how
 * the 2026-09-14 report came to be "fixed" while half the defect shipped on.
 *
 * WHAT REPLACED THE 60-WORD SEED, AND WHY.
 *
 * Until 2026-09-17 this file held REQUIRES_ACCENT, a hand-written map of 60
 * words to check. That is an allow-list by inversion: it enumerates what gets
 * checked, so every Spanish word nobody thought of could lose its accent with
 * the guard green. `busqueda`, `mas`, `mi`, `dia` and `recuperacion` all
 * shipped unaccented past it -- and `recuperacion` is the damning one, because
 * the seed already held nineteen `-ción` words, so the family was obviously
 * known and this one still slipped. A list of words cannot express a rule.
 *
 * The rule now comes from a real dictionary: `nspell` + `dictionary-es`
 * (Hunspell, with affix expansion, so conjugations and pronoun-suffixed verbs
 * like `cuéntanos` are covered). A word is flagged when it is NOT valid Spanish
 * and some accent-only variant of it IS. That is a rule, and it derives
 * thousands of cases instead of sixty.
 *
 * The dictionary is deliberately NOT trusted on reputation. See
 * `an-array-of-spanish-words` in CLAUDE.md: a 636,598-word Spanish corpus that
 * is ASCII-folded, which would have had the guard certify `busqueda` as correct
 * Spanish. The test probes the dictionary for known answers before using it.
 */

/**
 * WORDS THE RULE CANNOT DECIDE.
 *
 * Every entry here is a word whose UNACCENTED form is also valid Spanish, so
 * the dictionary declines to flag it and is right to. The value is the decision
 * *this codebase* has made about its own copy: in Tribe's UI these words only
 * ever have the accented meaning.
 *
 * This is not a leftover of the old seed and it does not shrink as the
 * dictionary improves. No dictionary of any size will ever decide these,
 * because both spellings are real words and only the sentence tells you which
 * was meant.
 */
export const RULE_CANNOT_DECIDE: Readonly<Record<string, string>> = {
  /**
   * `anos` IS VALID SPANISH. It is the plural of `ano`, and it does not mean
   * years. No dictionary will ever flag it, and no amount of improvement to the
   * rule above will change that.
   *
   * This is the string the entire accent effort started from: Ana reported
   * "Anos de Experiencia" on the instructor card on 2026-09-14, and it had been
   * live for months. It survived the first fix because it existed in two places
   * and only one was corrected.
   *
   * If you are reading this file having concluded that the dictionary made this
   * list redundant: it did not, and this entry is why. Deleting it puts
   * "Anos de Experiencia" back on the table.
   */
  anos: 'años',

  // The rest, in the same category: unaccented form is a real word, and the
  // accented meaning is the only one that occurs in Tribe's copy.
  mas: 'más', // `mas` = "but", archaic and literary; never used in UI copy
  titulo: 'título', // `titulo` = "I title" (titular); we always mean the noun
  pagina: 'página', // `pagina` = "he/she paginates"
  numero: 'número', // `numero` = "I number"
  ultimo: 'último', // `ultimo` = "I finalise" (ultimar)
  ultima: 'última', // same verb, third person
  ademas: 'además',
  ingles: 'inglés', // `ingles` = "groins"
  // ñ written as n. A dictionary keyed on acute accents alone will not see
  // these, and folding the tilde to catch them would flag every correct `n`.
  resena: 'reseña',
  resenas: 'reseñas',
  espanol: 'español',
  manana: 'mañana',
  companero: 'compañero',
  companeros: 'compañeros',
  contrasena: 'contraseña',
  diseno: 'diseño',
  extranan: 'extrañan',
  acompana: 'acompaña',
};

/**
 * LEAVE UNACCENTED. The opposite list: the bare form is correct in Tribe's
 * copy, so neither the rule nor the list above may flag it.
 *
 * Two reasons appear here, and they are different:
 *   - settled orthography: the RAE removed the accent in its 2010 Ortografía
 *   - genuinely context-dependent, and nobody has ruled on our instances yet
 */
export const LEAVE_UNACCENTED = [
  // RAE 2010: these are correct without the accent.
  'este',
  'solo',
  'esta',
  // Interrogative-only accents. `cuándo`/`cómo`/`qué`/`dónde`/`cuál`/`quién`
  // take the accent only in a question or exclamation; in a subordinate clause
  // ("Cuando alguien se une a tu sesión") they do not. With Ana.
  'cuando',
  'como',
  'que',
  'donde',
  'cual',
  'quien',
  'aun', // `aún` = "still/yet"; `aun` = "even". Instance-dependent. With Ana.
  'sera', // `será` almost certainly, but with Ana rather than guessed
  'veras', // `verás` (future) vs `veras` (noun, "de veras"). With Ana.
  'tu', // `tu` possessive vs `tú` pronoun. Both occur correctly in our copy.
  'futbol', // accepted unaccented in Mexican usage; `fútbol` elsewhere
  /**
   * `min` is the ABBREVIATION for minutes ("30 min", "15 min antes"), which is
   * correct unaccented. `mín` is the abbreviation of `mínimo`, a different
   * thing. The rule flagged all 16 of ours because `min` is not a Spanish word
   * and `mín` is -- true of the dictionary, wrong about the copy. Abbreviations
   * are the one category where "not a word" does not imply "misspelled".
   */
  'min',
  'unete',
  /**
   * `mi` (possessive, "mi perfil") and `mí` (stressed pronoun, "cerca de mí")
   * are different words, and only the grammatical role distinguishes them.
   * `Cerca de mi` shipped unaccented on /instructors and NO word list or
   * dictionary of any size would have caught it -- the dictionary says `mi` is
   * valid, because it is. This is the floor of the whole approach and it is
   * worth knowing where the floor is.
   */
  'mi',
] as const;

/** Matches a whole word, accent-insensitively on the left/right boundaries. */
export function accentWordPattern(word: string): RegExp {
  return new RegExp(`(?<![A-Za-zÁÉÍÓÚÑÜáéíóúñü])${word}(?![A-Za-zÁÉÍÓÚÑÜáéíóúñü])`, 'gi');
}

/** Strips acute accents and the diaeresis, leaving ñ alone. */
export function deaccent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/([aeiouAEIOU])[́̈]/g, '$1')
    .normalize('NFC');
}
