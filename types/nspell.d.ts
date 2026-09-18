/**
 * `nspell` ships no types. Only `correct()` is used by the accent guard, so the
 * declaration is deliberately minimal rather than a speculative full surface:
 * a hand-written .d.ts that claims more than the code uses is a claim nobody
 * checks.
 */
declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
  }
  function nspell(aff: Uint8Array | Buffer, dic: Uint8Array | Buffer): NSpell;
  export default nspell;
}
