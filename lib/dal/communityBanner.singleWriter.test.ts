/**
 * T-COMM1: every community banner write goes through lib/dal/communityBanner.
 *
 * The leak had two writers. The community page uploaded a new timestamped
 * file on every change, and the create page uploaded into profile-images the
 * moment a file was picked, before the community existed. Both left files
 * behind, and neither went through the DAL. The DAL now owns the one fixed
 * path, the upsert and the cleanup, so a third inline writer would quietly
 * bring the leak back.
 *
 * This asserts on the CALL (`storage.from('community-banners')`) and on the
 * old path prefix, not on a mention of either name, so a comment explaining
 * the history does not trip it. The first two cases prove the reading step
 * read something and that the pattern matches the code it exists to catch.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCAN = ['app', 'components', 'lib', 'hooks', 'contexts'];
const OWNER = 'lib/dal/communityBanner.ts';

const DIRECT_BUCKET_CALL = /\.from\(\s*['"`]community-banners['"`]\s*\)/;
const CREATE_PAGE_PREFIX = /['"`]community-covers\//;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = SCAN.flatMap((d) => walk(join(ROOT, d))).map((f) => relative(ROOT, f).split('\\').join('/'));

describe('community banners have one writer', () => {
  it('reads the source tree (a guard that read nothing passes everything)', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain(OWNER);
    expect(files).toContain('app/communities/create/page.tsx');
    expect(files).toContain('app/communities/[id]/page.tsx');
  });

  it('the patterns match the two writers this ticket removed', () => {
    expect(DIRECT_BUCKET_CALL.test("supabase.storage.from('community-banners').upload(fileName, compressed")).toBe(
      true
    );
    expect(CREATE_PAGE_PREFIX.test('const path = `community-covers/${userId}-${Date.now()}`')).toBe(true);
  });

  it('no file outside the DAL calls storage.from("community-banners")', () => {
    const offenders = files.filter((f) => f !== OWNER && DIRECT_BUCKET_CALL.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('nothing writes community covers into profile-images any more', () => {
    const offenders = files.filter((f) => CREATE_PAGE_PREFIX.test(readFileSync(join(ROOT, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
