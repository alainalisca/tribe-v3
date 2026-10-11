/**
 * Links a person will send, save or print are built from SITE_URL, not from
 * `window.location.origin`. T-DOMAIN1 step 1.
 *
 * WHY. The origin is whatever host the sharer happened to be on: inside the
 * native app it is tribe-v3.vercel.app, on a preview it is a URL that dies with
 * the deployment. A copied gym link, a shared post, a calendar event all carried
 * that host until 2026-10-11. appUrl() / SITE_URL (lib/http/siteUrl.ts) is the
 * one setting.
 *
 * WHAT IS ALLOWED. Same-origin plumbing that must come back to THIS origin,
 * because that is where the cookie lives: the OAuth redirectTo (the PKCE
 * verifier is stored on the origin that started the flow) and the Stripe
 * success/cancel URLs (the buyer's session is on that origin). And
 * `new URL('/api/...', window.location.origin)`, which is a fetch, not a link,
 * and does not match the pattern below.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.join(__dirname, '..', '..');
const SCAN = ['app', 'components', 'lib', 'hooks', 'contexts'];

const ALLOWED = new Set(['app/auth/useAuthHandlers.ts', 'app/promote/boosts/page.tsx']);

// `${window.location.origin}/...` and `window.location.origin : ''}/...`: an
// absolute link assembled from the current origin.
const ORIGIN_LINK = /window\.location\.origin\s*(\}|:[^}]*\})\s*\//;

function files(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'api') continue;
      files(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('shareable links use SITE_URL', () => {
  it('no app link is assembled from window.location.origin outside the allow-list', () => {
    const offenders: string[] = [];
    for (const top of SCAN) {
      const dir = path.join(ROOT, top);
      if (!fs.existsSync(dir)) continue;
      for (const file of files(dir)) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        if (ALLOWED.has(rel)) continue;
        fs.readFileSync(file, 'utf-8')
          .split('\n')
          .forEach((line, i) => {
            if (ORIGIN_LINK.test(line)) offenders.push(`${rel}:${i + 1}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the allow-listed files still exist (a stale entry would hide nothing and rot)', () => {
    for (const rel of ALLOWED) {
      expect(fs.readFileSync(path.join(ROOT, rel), 'utf-8')).toMatch(ORIGIN_LINK);
    }
  });
});
