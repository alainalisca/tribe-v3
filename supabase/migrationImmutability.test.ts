import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { executableSql } from './executableSql';
import frozen from './migrations_frozen.json';

/**
 * WORKING AGREEMENT, ENFORCED HERE:
 *
 *   The executable SQL of an applied migration is IMMUTABLE.
 *   Its comments are APPEND-ONLY.
 *   Corrections go in a dated addendum at the bottom, never by editing the
 *   original text.
 *
 * The header of a migration records what was BELIEVED when it ran. Rewriting
 * it in place destroys the only account of how that belief formed -- and the
 * belief is usually the interesting part, because a migration that was wrong
 * about something was wrong for a reason someone will hit again.
 *
 * Both halves have already happened here. 178 had its header corrected in
 * place after being applied; 179 shipped with a write-site list naming a file
 * that cannot write. Neither is visible from the SQL, and neither would ever
 * fail a test that only checked the database.
 *
 * WHY A GUARD RATHER THAN A CONVENTION. This is the lesson of the migration
 * NUMBER collisions: the convention "re-read origin/main before choosing a
 * number" was written down, understood, and then broken three times, because a
 * rule that depends on remembering is a rule that fails on the day you are
 * busy. The duplicate-number test found all of them in its first run. A rule
 * worth writing in CLAUDE.md is worth a test.
 */

const DIR = 'supabase/migrations';
const manifest = frozen as Record<string, string>;

const hash = (file: string) =>
  createHash('sha256')
    .update(executableSql(readFileSync(join(DIR, file), 'utf8')))
    .digest('hex');

/** Leading number, or null for the 2026-04-19 bulk import's named files. */
const numberOf = (f: string): number | null => {
  const m = /^(\d{3})_/.exec(f);
  return m ? parseInt(m[1], 10) : null;
};

const onDisk = () =>
  readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

describe('applied migrations are immutable below the frozen line', () => {
  it('every frozen migration still hashes to its recorded value', () => {
    const changed = Object.entries(manifest)
      .filter(([f]) => onDisk().includes(f))
      .filter(([f, want]) => hash(f) !== want)
      .map(([f]) => f);

    expect(
      changed,
      'The EXECUTABLE SQL of an applied migration changed. Comments are append-only and SQL is immutable: ' +
        'revert the edit and put the correction in a dated addendum at the bottom of the file. ' +
        'Do NOT run scripts/freezeMigrations.ts to make this pass -- that records the change instead of rejecting it.'
    ).toEqual([]);
  });

  it('no frozen migration has been deleted or renamed', () => {
    const missing = Object.keys(manifest).filter((f) => !onDisk().includes(f));
    expect(
      missing,
      'A migration that has run on production is gone from the directory. Renaming an applied migration ' +
        'breaks the record of what ran; if it was renumbered, say so in an addendum and re-freeze deliberately.'
    ).toEqual([]);
  });

  /**
   * The frozen line. Everything at or below the highest frozen number is
   * applied and must be frozen; anything above it is still being written and
   * is free to change until it is applied and frozen.
   *
   * Without this, the obvious hole is a NEW file slipped in below the line --
   * a gap-filler numbered 176 -- which no other assertion here would notice,
   * because the manifest only knows about files it already lists.
   */
  it('every migration at or below the highest frozen number is frozen', () => {
    const numbers = Object.keys(manifest)
      .map(numberOf)
      .filter((n): n is number => n !== null);
    const ceiling = Math.max(...numbers);

    const unfrozen = onDisk().filter((f) => {
      if (f in manifest) return false;
      const n = numberOf(f);
      return n === null || n <= ceiling;
    });

    expect(
      unfrozen,
      `These sit at or below the highest frozen migration (${ceiling}) but are not frozen. A new migration ` +
        'takes the NEXT number; if one of these has now been applied, freeze it with scripts/freezeMigrations.ts.'
    ).toEqual([]);
  });
});

/**
 * The extractor's own tests. Without these the guard above is a hash of
 * whatever the tokeniser happens to produce, and "stable" would be
 * indistinguishable from "correct" -- a naive `--` stripper also produces
 * stable hashes while being blind to everything after `--` inside a string.
 */
describe('executableSql sees what it claims to see', () => {
  it('ignores a line comment', () => {
    expect(executableSql('SELECT 1; -- hello')).toBe(executableSql('SELECT 1; -- goodbye'));
  });

  it('ignores an appended addendum block', () => {
    const base = 'ALTER TABLE t ADD COLUMN c text;';
    expect(executableSql(base + '\n\n-- ADDENDUM 2026-09-21\n-- this was wrong\n')).toBe(executableSql(base));
  });

  it('ignores a nested block comment', () => {
    expect(executableSql('SELECT 1; /* a /* b */ c */')).toBe(executableSql('SELECT 1;'));
  });

  it('DOES see a change to executable SQL', () => {
    expect(executableSql('SELECT 1;')).not.toBe(executableSql('SELECT 2;'));
  });

  /**
   * The one that kills the regex implementation. Migration 179's abort message
   * really does contain `--` inside a quoted string; a `--.*$` stripper
   * truncates there and cannot see any edit past it.
   */
  it('DOES see a change after a -- INSIDE a string literal', () => {
    const a = "RAISE EXCEPTION 'aborted -- do NOT widen this to a range.';";
    const b = "RAISE EXCEPTION 'aborted -- widening is fine actually.';";
    expect(executableSql(a)).not.toBe(executableSql(b));
    expect(executableSql(a)).toContain('do NOT widen');
  });

  it("treats '' as an escaped quote, not as the end of a string", () => {
    const a = "SELECT 'it''s -- fine';";
    const b = "SELECT 'it''s -- broken';";
    expect(executableSql(a)).not.toBe(executableSql(b));
  });

  /** A function body is stored verbatim in pg_proc, so a comment inside one
   *  genuinely changes a database object. 177 exists because a live body could
   *  not be recovered from this repo. */
  it('DOES see a comment change inside a dollar-quoted body', () => {
    const a = 'DO $$ BEGIN -- original\n NULL; END $$;';
    const b = 'DO $$ BEGIN -- rewritten\n NULL; END $$;';
    expect(executableSql(a)).not.toBe(executableSql(b));
  });

  it('handles tagged dollar quotes', () => {
    const a = 'DO $outer$ BEGIN -- x\n NULL; END $outer$;';
    const b = 'DO $outer$ BEGIN -- y\n NULL; END $outer$;';
    expect(executableSql(a)).not.toBe(executableSql(b));
  });

  it('normalises whitespace so reformatting is not a change', () => {
    expect(executableSql('SELECT\n   1;')).toBe(executableSql('SELECT 1;'));
  });
});
