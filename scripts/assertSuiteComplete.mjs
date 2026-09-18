#!/usr/bin/env node
/**
 * Fails when vitest ran fewer test files than exist on disk.
 *
 * WHY THIS EXISTS. On 2026-09-18 the suite was measured across repeated runs of
 * an unchanged commit:
 *
 *   201 of 204 files   1838 tests   3 runner errors
 *   204 of 204 files   1869 tests   0
 *   201 of 204 files   1843 tests   0   <- reported GREEN, three files never ran
 *
 * A green summary is a claim about the tests that RAN, not about the tests that
 * EXIST, and the two are only the same number if something asserts it. Nothing
 * did. Vitest reports a dropped file by shrinking its own denominator, so the
 * run still exits 0 and the summary still says passed.
 *
 * Disabling file parallelism made it rarer but not impossible (one file still
 * dropped) and cost 55 minutes against 30 seconds, so the pool setting is left
 * alone deliberately. The reporting is the defect, and it is a defect at any
 * concurrency: a file that never ran must FAIL the run rather than quietly
 * reduce what the run claims to cover.
 *
 * This also surfaces vitest's own failure count, so one command and one exit
 * code cover both "something failed" and "something never ran".
 *
 * Usage: node scripts/assertSuiteComplete.mjs [results.json]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const resultsPath = path.resolve(ROOT, process.argv[2] ?? '.vitest-results.json');

/**
 * Directories vitest does not collect from. KEEP IN SYNC WITH THE `exclude`
 * LIST IN vitest.config.ts -- if they drift, this check reports files vitest
 * was never going to run and becomes noise the next person learns to ignore.
 * `.claude/worktrees` in particular holds whole second copies of the repo.
 */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'e2e', '.claude', 'coverage', 'playwright-report']);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function testFilesOnDisk(dir = ROOT, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      testFilesOnDisk(path.join(dir, entry.name), acc);
    } else if (TEST_FILE.test(entry.name)) {
      acc.push(path.relative(ROOT, path.join(dir, entry.name)));
    }
  }
  return acc;
}

if (!fs.existsSync(resultsPath)) {
  console.error(`assertSuiteComplete: no results at ${path.relative(ROOT, resultsPath)}.`);
  console.error('Run vitest with --reporter=json --outputFile=<path> first.');
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const ran = new Set((results.testResults ?? []).map((t) => path.relative(ROOT, t.name)));
const onDisk = testFilesOnDisk().sort();
const missing = onDisk.filter((f) => !ran.has(f));
const unexpected = [...ran].filter((f) => !onDisk.includes(f));

const failedTests = results.numFailedTests ?? 0;
let bad = false;

if (missing.length > 0) {
  bad = true;
  console.error(`\nSUITE INCOMPLETE: ${ran.size} of ${onDisk.length} test files ran. ${missing.length} never did:\n`);
  for (const f of missing) console.error(`  ${f}`);
  console.error(
    '\nThese files did not run, and vitest reported the shortfall by shrinking\n' +
      'its own denominator rather than failing. Re-run; if a file goes missing\n' +
      'repeatedly, it is failing to collect rather than being dropped.\n'
  );
}

if (unexpected.length > 0) {
  bad = true;
  console.error(`\nRAN ${unexpected.length} FILE(S) NOT FOUND ON DISK -- this check's SKIP_DIRS has drifted from vitest.config.ts:\n`);
  for (const f of unexpected) console.error(`  ${f}`);
}

if (failedTests > 0) {
  bad = true;
  console.error(`\n${failedTests} test(s) failed.\n`);
}

if (bad) process.exit(1);
console.log(`Suite complete: ${ran.size} of ${onDisk.length} test files ran, ${results.numTotalTests} tests, 0 failures.`);
