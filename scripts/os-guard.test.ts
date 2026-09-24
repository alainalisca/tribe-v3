import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPTS_DIR = join(__dirname);
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');
const TEST_DIR = join(MIGRATIONS_DIR, '__test_os_guard__');

function runGuard(env: Record<string, string> = {}) {
  const result = execSync(`node ${join(SCRIPTS_DIR, 'os-guard.mjs')}`, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    cwd: join(__dirname, '..'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result;
}

function runGuardExpectFail(env: Record<string, string> = {}) {
  try {
    execSync(`node ${join(SCRIPTS_DIR, 'os-guard.mjs')}`, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      cwd: join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    throw new Error('Expected os-guard to fail but it passed');
  } catch (e: unknown) {
    const err = e as { stderr?: string; status?: number };
    return err.stderr || '';
  }
}

describe('os-guard', () => {
  it('passes on tribe-os/main with no migrations', () => {
    const output = runGuard();
    expect(output).toContain('os-guard OK');
    expect(output).toContain('branch=tribe-os/main');
  });

  it('fails when EMAIL_MODE is not log', () => {
    const stderr = runGuardExpectFail({ EMAIL_MODE: 'live' });
    expect(stderr).toContain('EMAIL_MODE');
    expect(stderr).toContain('FAILED');
  });

  it('fails when PUSH_MODE is not log', () => {
    const stderr = runGuardExpectFail({ PUSH_MODE: 'live' });
    expect(stderr).toContain('PUSH_MODE');
  });

  it('fails when TRIBE_OS_AI_PROVIDER=anthropic without TRIBE_OS_AI_LIVE=true', () => {
    const stderr = runGuardExpectFail({ TRIBE_OS_AI_PROVIDER: 'anthropic' });
    expect(stderr).toContain('anthropic');
    expect(stderr).toContain('TRIBE_OS_AI_LIVE');
  });

  it('passes when TRIBE_OS_AI_PROVIDER=anthropic with TRIBE_OS_AI_LIVE=true', () => {
    const output = runGuard({
      TRIBE_OS_AI_PROVIDER: 'anthropic',
      TRIBE_OS_AI_LIVE: 'true',
    });
    expect(output).toContain('os-guard OK');
    expect(output).toContain('ai=anthropic');
  });
});

describe('os-migration-check', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it('rejects a Class A file with CREATE TRIGGER on sessions (acceptance check 3)', () => {
    const migFile = join(MIGRATIONS_DIR, '9000_test_bad_trigger.sql');
    try {
      writeFileSync(
        migFile,
        `-- CLASS: A\n-- TABLE: sessions (consumer)\nCREATE TRIGGER my_trigger AFTER INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION my_fn();\n`
      );
      const stderr = runGuardExpectFail();
      expect(stderr).toContain('CREATE');
      expect(stderr).toContain('TRIGGER');
      expect(stderr).toContain('consumer table');
    } finally {
      if (existsSync(migFile)) rmSync(migFile);
    }
  });

  it('rejects a Class A file with DROP TABLE', () => {
    const migFile = join(MIGRATIONS_DIR, '9001_test_bad_drop.sql');
    try {
      writeFileSync(migFile, `-- CLASS: A\n-- TABLE: tribe_os_test (tribe-os)\nDROP TABLE IF EXISTS tribe_os_test;\n`);
      const stderr = runGuardExpectFail();
      expect(stderr).toContain('DROP');
    } finally {
      if (existsSync(migFile)) rmSync(migFile);
    }
  });

  it('accepts a valid Class A migration', () => {
    const migFile = join(MIGRATIONS_DIR, '9002_test_valid.sql');
    try {
      writeFileSync(
        migFile,
        `-- CLASS: A\n-- TABLE: tribe_os_new_thing (tribe-os)\nCREATE TABLE IF NOT EXISTS tribe_os_new_thing (id uuid PRIMARY KEY DEFAULT gen_random_uuid());\n`
      );
      const output = runGuard();
      expect(output).toContain('os-guard OK');
      expect(output).toContain('migrations=1 A');
    } finally {
      if (existsSync(migFile)) rmSync(migFile);
    }
  });

  it('rejects Class B without .held.sql extension', () => {
    const migFile = join(MIGRATIONS_DIR, '9003_test_classb.sql');
    try {
      writeFileSync(
        migFile,
        `-- CLASS: B (HELD)\n-- TABLE: users (consumer)\nALTER TABLE users ADD COLUMN test_col text;\n`
      );
      const stderr = runGuardExpectFail();
      expect(stderr).toContain('.held.sql');
    } finally {
      if (existsSync(migFile)) rmSync(migFile);
    }
  });

  it('accepts a Class B file with .held.sql extension', () => {
    const migFile = join(MIGRATIONS_DIR, '9004_test_classb.held.sql');
    try {
      writeFileSync(
        migFile,
        `-- CLASS: B (HELD)\n-- TABLE: users (consumer)\nALTER TABLE users ADD COLUMN test_col text;\n`
      );
      const output = runGuard();
      expect(output).toContain('os-guard OK');
      expect(output).toContain('0 A / 1 held');
    } finally {
      if (existsSync(migFile)) rmSync(migFile);
    }
  });
});
