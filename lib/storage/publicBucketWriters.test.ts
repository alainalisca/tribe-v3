/**
 * session-photos stays PUBLIC after migration 199 because it holds session
 * listing photos, which are public by design. Recap photos used to be uploaded
 * there too, which is what made them public. This guard keeps it that way:
 * the only module that may name the session-photos bucket is the listing
 * photo uploader, and every recap upload goes through uploadRecapPhotoFile.
 *
 * A source scan, because the defect it guards against is WHICH bucket a call
 * site names, and a component test mounting either uploader with a mocked
 * client cannot see that unless it is written for that one file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['app', 'components', 'lib', 'hooks'];
// The listing photo uploader: the one legitimate writer of session-photos.
const LISTING_UPLOADER = 'app/create/PhotoUploadSection.tsx';
// Test files are excluded by rule: they name the bucket to assert that code
// does NOT use it (this file included), and a test cannot upload anything.
const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f);
// The move script's planner names it as the SOURCE it moves files out of.
const MOVE_PLANNER = 'lib/storage/recapMovePlan.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => {
  try {
    return walk(path.join(ROOT, d));
  } catch {
    return [];
  }
}).map((f) => path.relative(ROOT, f));

function namesBucket(src: string, bucket: string): boolean {
  return new RegExp(`['"\`]${bucket}['"\`]`).test(src);
}

describe('who may write to the public session-photos bucket', () => {
  it('scans a real corpus (the reading step found files)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain(LISTING_UPLOADER);
  });

  it('no module except the listing photo uploader names session-photos', () => {
    const offenders = files.filter(
      (f) =>
        f !== LISTING_UPLOADER &&
        f !== MOVE_PLANNER &&
        !isTest(f) &&
        namesBucket(readFileSync(path.join(ROOT, f), 'utf8'), 'session-photos')
    );
    expect(offenders).toEqual([]);
  });

  it('each exemption still earns its place: both files really name session-photos', () => {
    for (const f of [LISTING_UPLOADER, MOVE_PLANNER]) {
      expect(namesBucket(readFileSync(path.join(ROOT, f), 'utf8'), 'session-photos'), f).toBe(true);
    }
  });

  it('both recap uploaders go through uploadRecapPhotoFile', () => {
    for (const f of ['components/session/recapPhotosHelpers.ts', 'components/PostSessionFlow.tsx']) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, f).toMatch(/uploadRecapPhotoFile\(/);
      expect(src, f).not.toMatch(/storage\.from\(/);
    }
  });
});
