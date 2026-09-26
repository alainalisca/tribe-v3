/**
 * T-AV0 acceptance check 3: av-migration-check rejects a sample 8000+ file
 * with no header, and one with DROP COLUMN.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FIXTURES LIVE IN A TEMP DIRECTORY, NOT IN supabase/migrations/
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Three guards on main enumerate supabase/migrations/ (coverage, duplicate
 * numbers, immutability). A deliberately-broken sample file committed there
 * would be counted as a real migration by whichever of them could see it, and
 * a guard's own test data showing up as a finding is a trap this repo has now
 * hit three times (CLAUDE.md: the accent guard reading 'unete' out of its own
 * exemption list). So every fixture is written to mkdtemp and thrown away.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ARMS, AND WHY EACH ONE IS HERE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Failure arms prove the check CAN fire. They pass by construction -- feed a
 * violated precondition to a working guard and it can only object. The arm
 * that tells you something is the SUCCESS arm: a complete, legal migration
 * must come back clean, or the guard is unsatisfiable and the first real T-AV
 * migration is blocked by its own tripwire.
 *
 * The prose arm is the one written from a known defect rather than from the
 * spec. Four guards in this repo have matched their own author's comment
 * (CLAUDE.md lists them; the most recent turned main red over the word "so").
 * A migration header explaining "this file deliberately contains no DROP
 * COLUMN" must not be read as containing one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkAvMigrations, headerBlock, tablesTouched, ownerLines } from './avMigrationCheck.ts';

let dir: string;
let verifier: string;

/** A probe row in the verifier's shape, for every id the fixtures use. */
const VERIFIER = `
select '8000_pass_catalog' as migration, 'applied' as state
union all select '8001_no_header'
union all select '8002_drop_column'
union all select '8003_prose_only'
union all select '8004_unowned_table'
union all select '8005_rename'
union all select '193_wrong_block';
`;

const GOOD = `-- 8000_pass_catalog.sql
--
-- PROGRAM: T-AV
-- TICKET: T-AV1
-- TABLE: av_pass_catalog OWNER: t-av-new
--
-- Additive: one new table, owned by this program, written by nothing on main.

create table if not exists public.av_pass_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
);
`;

function write(name: string, body: string) {
  writeFileSync(join(dir, name), body);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'av-mig-'));
  verifier = join(dir, 'verify-migration-state.sql');
  writeFileSync(verifier, VERIFIER);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function problemsFor(file: string): string[] {
  return checkAvMigrations(dir, verifier)
    .problems.filter((p) => p.file === file)
    .map((p) => `${p.rule}: ${p.detail}`);
}

describe('av-migration-check', () => {
  it('passes a complete, legal 8000-block migration (the satisfiability arm)', () => {
    write('8000_pass_catalog.sql', GOOD);
    const result = checkAvMigrations(dir, verifier);
    expect(result.checked).toContain('8000_pass_catalog.sql');
    expect(problemsFor('8000_pass_catalog.sql')).toEqual([]);
  });

  it('rejects an 8000+ file with no header', () => {
    write('8001_no_header.sql', `create table if not exists public.av_streaks (id uuid primary key);\n`);
    const found = problemsFor('8001_no_header.sql');
    expect(found.some((p) => p.includes('PROGRAM: T-AV'))).toBe(true);
    expect(found.some((p) => p.includes('TICKET: T-AVn'))).toBe(true);
    expect(found.some((p) => p.startsWith('owner:'))).toBe(true);
  });

  it('rejects an 8000+ file containing DROP COLUMN', () => {
    write(
      '8002_drop_column.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV2
-- TABLE: sessions OWNER: consumer

alter table public.sessions drop column legacy_note;
`
    );
    expect(problemsFor('8002_drop_column.sql')).toContainEqual(expect.stringContaining('DROP COLUMN'));
  });

  it('rejects RENAME and DROP TABLE the same way', () => {
    write(
      '8005_rename.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV2
-- TABLE: sessions OWNER: consumer

alter table public.sessions rename column note to notes;
`
    );
    expect(problemsFor('8005_rename.sql')).toContainEqual(expect.stringContaining('RENAME'));
  });

  it('does NOT fire on a header that merely describes the forbidden statements', () => {
    write(
      '8003_prose_only.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV3
-- TABLE: av_notes OWNER: t-av-new
--
-- Additive only. There is deliberately no DROP COLUMN and no RENAME here --
-- anything destructive is a separate migration on main's sequence, reviewed
-- on its own, per T-AV0 Step 3.

create table if not exists public.av_notes (id uuid primary key);
`
    );
    expect(problemsFor('8003_prose_only.sql')).toEqual([]);
  });

  it('rejects a table altered with no owner line', () => {
    write(
      '8004_unowned_table.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV4

alter table public.users add column if not exists av_opt_in boolean default false;
`
    );
    expect(problemsFor('8004_unowned_table.sql')).toContainEqual(expect.stringContaining('"users"'));
  });

  it('rejects a T-AV migration numbered outside the reserved block', () => {
    write(
      '193_wrong_block.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV5

create table if not exists public.av_sneaky (id uuid primary key);
`
    );
    expect(problemsFor('193_wrong_block.sql')).toContainEqual(expect.stringContaining('numbered 193'));
  });

  it('rejects an 8000+ migration with no probe in the verifier', () => {
    write(
      '8009_no_probe.sql',
      `-- PROGRAM: T-AV
-- TICKET: T-AV6
-- TABLE: av_probeless OWNER: t-av-new

create table if not exists public.av_probeless (id uuid primary key);
`
    );
    expect(problemsFor('8009_no_probe.sql')).toContainEqual(
      expect.stringContaining('probe in supabase/verify-migration-state.sql')
    );
  });

  it('ignores migrations outside the block that make no T-AV claim', () => {
    write('194_ordinary_main_migration.sql', `alter table public.users drop column whatever;\n`);
    const result = checkAvMigrations(dir, verifier);
    expect(result.checked).not.toContain('194_ordinary_main_migration.sql');
    expect(problemsFor('194_ordinary_main_migration.sql')).toEqual([]);
  });
});

describe('av-migration-check parts', () => {
  it('headerBlock stops at the first executable line', () => {
    const h = headerBlock('-- one\n\n-- two\nselect 1;\n-- PROGRAM: T-AV\n');
    expect(h).toContain('-- two');
    expect(h).not.toContain('PROGRAM');
  });

  it('tablesTouched sees create and alter, quoted or schema-qualified', () => {
    expect(
      tablesTouched('create table if not exists "public"."AV_Foo" (id int); alter table only bar add column x int;')
    ).toEqual(['av_foo', 'bar']);
  });

  it('ownerLines reads the table/owner pairs', () => {
    expect([...ownerLines('-- TABLE: public.sessions OWNER: consumer').entries()]).toEqual([['sessions', 'consumer']]);
  });
});

/**
 * The same rules over the REAL tree, so the suite goes red the moment a T-AV
 * migration arrives without its header, its owner lines or its probe (T-AV0
 * Step 3, last bullet). None of main's three migration guards can see a
 * four-digit filename, so without this arm an 8000-block migration could
 * merge to athlete/main entirely unexamined.
 */
describe('the real migrations directory', () => {
  it('has no offending T-AV migration', () => {
    const { problems } = checkAvMigrations(
      join(import.meta.dirname, 'migrations'),
      join(import.meta.dirname, 'verify-migration-state.sql')
    );
    expect(problems.map((p) => `${p.file} [${p.rule}] ${p.detail}`)).toEqual([]);
  });
});
