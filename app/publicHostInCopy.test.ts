/**
 * No sentence a user reads tells them to go to tribe-v3.vercel.app.
 *
 * WHY. Tribe's address is tribelatam.com (T-DOMAIN1). The Tribe.OS invite form
 * still told a coach to "sign up at tribe-v3.vercel.app" until 2026-10-11,
 * which is the project-not-business look the domain exists to remove.
 *
 * WHY A RULE, NOT A LIST. tribe-v3.vercel.app legitimately stays in code: the
 * native app loads it (capacitor.config.ts), DeepLinkRouter accepts it, and
 * printed QR codes point at it. Those are bare hosts or URLs. Copy is a
 * sentence, and a sentence has a space. So the rule is: a rendered string that
 * contains the old host AND whitespace is copy, and copy must not name it. No
 * allow-list, so nothing can rot.
 *
 * HOW. Uses lib/testing/renderableText.ts: TypeScript AST,
 * string literals, template text and JSX text only, comments never read. Scans
 * app/ (outside app/api), components/, lib/ and messages/*.json.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderableText } from '@/lib/testing/renderableText';

const ROOT = path.join(__dirname, '..');
const OLD_HOST = 'tribe-v3.vercel.app';

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (full === path.join(ROOT, 'app', 'api') || e.name === 'node_modules') continue;
      files(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** True when `text` is prose (has whitespace) that names the old host. */
export function isCopyNamingOldHost(text: string): boolean {
  return text.includes(OLD_HOST) && /\s/.test(text.trim());
}

/** Every string value in a JSON tree. */
function jsonStrings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(jsonStrings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(jsonStrings);
  return [];
}

describe('copy never sends a user to tribe-v3.vercel.app', () => {
  const sources = ['app', 'components', 'lib'].flatMap((d) => files(path.join(ROOT, d)));
  const messages = fs
    .readdirSync(path.join(ROOT, 'messages'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(ROOT, 'messages', f));

  it('read a real corpus, including a file that legitimately holds the bare host', () => {
    expect(sources.length).toBeGreaterThan(300);
    expect(messages.length).toBeGreaterThanOrEqual(2);
    // DeepLinkRouter keeps the host as data; seeing it proves the reader works
    // and that the rule, not an exclusion, is what lets it through.
    const router = renderableText(
      'x.tsx',
      fs.readFileSync(path.join(ROOT, 'components', 'DeepLinkRouter.tsx'), 'utf-8')
    );
    expect(router).toContain(OLD_HOST);
    expect(router.some(isCopyNamingOldHost)).toBe(false);
  });

  it('no rendered sentence in app/, components/, lib/ or messages/ names the old host', () => {
    const offenders = [
      ...sources.filter((f) => renderableText(f, fs.readFileSync(f, 'utf-8')).some(isCopyNamingOldHost)),
      ...messages.filter((f) => jsonStrings(JSON.parse(fs.readFileSync(f, 'utf-8'))).some(isCopyNamingOldHost)),
    ];
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  describe('the rule', () => {
    it('flags the original invite-form sentence, in both languages', () => {
      expect(isCopyNamingOldHost('Ask them to sign up at tribe-v3.vercel.app first, then try again.')).toBe(true);
      expect(isCopyNamingOldHost('Pídele que se registre en tribe-v3.vercel.app primero.')).toBe(true);
    });

    it('lets a bare host or URL through, and ignores the new domain', () => {
      expect(isCopyNamingOldHost('tribe-v3.vercel.app')).toBe(false);
      expect(isCopyNamingOldHost('https://tribe-v3.vercel.app')).toBe(false);
      expect(isCopyNamingOldHost('Sign up at tribelatam.com first.')).toBe(false);
    });
  });
});
