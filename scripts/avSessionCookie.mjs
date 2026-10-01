#!/usr/bin/env node
/**
 * T-AV24. Print a Cookie header that signs a SEED account into the LOCAL dev
 * server, for proofs that must look at a signed-in page's HTML and RSC
 * payload (supabase/recon/t-av24-proof.LOCAL.sh).
 *
 *   node scripts/avSessionCookie.mjs ana@av.local
 *
 * The cookie is produced by @supabase/ssr itself, signing in with the seed
 * password through the same createServerClient the app uses, so its name,
 * format and any chunking are the real ones rather than a hand-built copy
 * that would drift the day the library changes.
 *
 * LOCAL ONLY. Refuses unless the Supabase URL is this machine, and only
 * accepts @av.local seed accounts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServerClient } from '@supabase/ssr';
import { readEnvFile } from './envFile.mjs';
import { isLocalDbUrl } from './avLocalDb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readEnvFile(path.join(ROOT, '.env.av.local')), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const email = process.argv[2] ?? '';

if (!isLocalDbUrl(url)) {
  console.error(`avSessionCookie REFUSED: "${url || 'not set'}" is not a local stack.`);
  process.exit(2);
}
if (!/^[a-z0-9._-]+@av\.local$/.test(email)) {
  console.error('avSessionCookie REFUSED: only @av.local seed accounts.');
  process.exit(2);
}

const jar = new Map();
const supabase = createServerClient(url, anon, {
  cookies: {
    get: (name) => jar.get(name),
    set: (name, value) => jar.set(name, value),
    remove: (name) => jar.delete(name),
  },
});

const { error } = await supabase.auth.signInWithPassword({ email, password: 'tribe-local-1234' });
if (error || jar.size === 0) {
  console.error(`avSessionCookie FAILED for ${email}: ${error?.message ?? 'no cookie was set'}`);
  process.exit(1);
}
// The Cookie header is this script's output, so it goes to stdout, not a log.
process.stdout.write([...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ') + '\n');
