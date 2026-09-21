/**
 * Extracts the EXECUTABLE text of a .sql file: everything that is not a
 * comment, whitespace-normalised, so a hash of it is stable under reformatting
 * and under any amount of appended prose.
 *
 * This exists so `migrationImmutability.test.ts` can enforce the working
 * agreement that an applied migration's SQL is immutable while its comments
 * are append-only.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A TOKENISER AND NOT A REGEX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `line.replace(/--.*$/, '')` is the obvious implementation and it is wrong on
 * this repo's own files. Migration 179's abort message contains:
 *
 *     'If the data has genuinely moved, re-measure and re-decide the
 *      conflicts -- do NOT widen this to a range.'
 *
 * A regex stripper truncates that string at the `--`. The resulting hash is
 * still STABLE, which is what makes it dangerous: the guard would look like it
 * worked, while every character after `--` inside any string literal became
 * invisible to it. Someone could rewrite an applied migration's abort message,
 * or a RAISE that names a table, and the guard would report no change.
 *
 * That is the vacuous-check shape this repo keeps finding: an instrument that
 * reports confidently about a population it cannot see. So the states are
 * tracked properly.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DOLLAR-QUOTED BODIES ARE KEPT WHOLE, COMMENTS INCLUDED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Comments inside `$$ ... $$` are NOT stripped, deliberately. A CREATE
 * FUNCTION body is stored verbatim in pg_proc, so editing a comment inside one
 * genuinely changes a database object -- `pg_get_functiondef` returns
 * different text afterwards. Migration 177 exists precisely because a live
 * function's body could not be recovered from this repo, and it captures that
 * body byte-for-byte.
 *
 * So inside a dollar-quoted block, everything counts. An addendum belongs at
 * the bottom of the file, outside every block, which is where the working
 * agreement puts it anyway.
 */
export function executableSql(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];

    // -- line comment (only outside strings and dollar quotes; we only reach
    // here in the "normal" state)
    if (c === '-' && src[i + 1] === '-') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }

    // /* block comment */ -- Postgres nests these, so track depth
    if (c === '/' && src[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (src[i] === '*' && src[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      continue;
    }

    // 'single quoted string', where '' is an escaped quote
    if (c === "'") {
      out += c;
      i++;
      while (i < n) {
        if (src[i] === "'" && src[i + 1] === "'") {
          out += "''";
          i += 2;
          continue;
        }
        if (src[i] === "'") {
          out += "'";
          i++;
          break;
        }
        out += src[i];
        i++;
      }
      continue;
    }

    // "quoted identifier"
    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        out += src[i];
        if (src[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    // $$ ... $$ or $tag$ ... $tag$, kept whole (see header)
    if (c === '$') {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(src.slice(i));
      if (m) {
        const tag = m[0];
        const end = src.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        out += src.slice(i, stop);
        i = stop;
        continue;
      }
    }

    out += c;
    i++;
  }

  return out.replace(/\s+/g, ' ').trim();
}
