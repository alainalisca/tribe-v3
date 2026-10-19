import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * T-MOM1 (Al, 2026-10-19): /dev/moments' fixture photos live in
 * dev/fixtures/moments/, never in public/, never ship, and are never a Leo
 * portrait or a banned Zona frame (the same pattern as the site's
 * banned-frames test in lib/site/photos.test.ts).
 */
const BANNED = /(?:^|[^0-9])(?:976[456]|977[67]|985[6-9]|986[0-3])(?:[^0-9]|$)|ronald|run.?club/i;
const root = process.cwd();
const dir = join(root, 'dev', 'fixtures', 'moments');

describe('/dev/moments fixtures (T-MOM1)', () => {
  it('are in dev/fixtures/moments, with their source frames recorded, none banned', () => {
    const files = readdirSync(dir).filter((f) => f.endsWith('.jpg'));
    expect(files.length).toBeGreaterThanOrEqual(9);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    for (const f of files) expect(readme, f).toContain(`| ${f} |`);
    // The recorded source frames, not just the file names.
    const sources = readme.split('\n').filter((l) => l.startsWith('| ') && l.includes('.jpg'));
    expect(sources.filter((l) => BANNED.test(l.split('|')[2] ?? ''))).toEqual([]);
  });

  it('never ship: ignored by Vercel and excluded from function tracing', () => {
    expect(readFileSync(join(root, '.vercelignore'), 'utf8')).toMatch(/^dev\/fixtures\/$/m);
    expect(readFileSync(join(root, 'next.config.ts'), 'utf8')).toContain("outputFileTracingExcludes: { '*': ['./dev/fixtures/**'] }");
  });

  it('no /dev/moments screen reads a photo from public/', () => {
    const devDir = join(root, 'app', 'dev', 'moments');
    for (const f of readdirSync(devDir).filter((n) => /\.tsx?$/.test(n))) {
      const src = readFileSync(join(devDir, f), 'utf8');
      expect(src, f).not.toMatch(/['"`]\/site\//);
      expect(src, f).not.toMatch(/'public'/);
    }
  });
});
