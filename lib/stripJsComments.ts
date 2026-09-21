/**
 * Removes comments from TypeScript/JavaScript source, leaving string literals
 * intact, so a textual guard can tell a MENTION from a READ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A TOKENISER AND NOT `line.replace(/\/\/.*$/, '')`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The one-line version truncates at the `//` inside `https://`. Every URL in
 * the codebase would eat the rest of its own line, so anything after a URL
 * becomes invisible to the guard -- silently, and in the direction of passing.
 *
 * That is the same failure as the SQL comment stripper in
 * supabase/executableSql.ts, which could not be a regex because migration 179's
 * abort message contains `--` inside a quoted string. Different language, same
 * shape: a comment marker that also occurs inside a string literal.
 *
 * Template literals are tracked because `${...}` can contain anything,
 * including a `//` that is code rather than a comment.
 */
export function stripJsComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    // line comment
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // block comment
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    // '...' and "..." with backslash escapes
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // `...` including ${ } interpolation, where a // really is code
    if (c === '`') {
      out += c;
      i++;
      let depth = 0;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        if (src[i] === '$' && src[i + 1] === '{') {
          depth++;
          out += '${';
          i += 2;
          continue;
        }
        if (src[i] === '}' && depth > 0) {
          depth--;
          out += '}';
          i++;
          continue;
        }
        // Inside ${ }, we are back in code, so a // or /* really is a comment.
        // Leaving them in would only ever produce a FALSE POSITIVE -- the safe
        // direction, since it fails loudly -- but the whole point of this
        // function is that a mention is not a read, so handle it.
        if (depth > 0 && src[i] === '/' && src[i + 1] === '/') {
          while (i < n && src[i] !== '\n') i++;
          continue;
        }
        if (depth > 0 && src[i] === '/' && src[i + 1] === '*') {
          i += 2;
          while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === '`' && depth === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    out += c;
    i++;
  }

  return out;
}
