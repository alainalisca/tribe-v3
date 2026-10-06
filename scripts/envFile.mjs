/**
 * One KEY=VALUE reader, shared by scripts/av-guard.mjs and scripts/av-dev.mjs.
 *
 * It is a module rather than two copies because the thing this repo pays for
 * most often is the SAME logic living in several files and drifting -- five
 * declarations of SPORTS_LIST, two translation maps for the same 23 keys,
 * three hand-kept copies of the applied-migration list, four copies of a naive
 * SQL comment stripper. A guard reading `.env.av.local` one way while the dev
 * launcher reads it another would mean av-guard vouching for an environment
 * the app never had.
 *
 * Deliberately small: no interpolation, no multi-line values, no `export`
 * semantics beyond stripping the word. `.env.av.local` holds a URL, two keys
 * and a handful of flags. If it ever needs more than this, that is the signal
 * to use a real parser, not to grow this one.
 *
 * NOT `node --env-file`, which was the first implementation and does not work
 * here: Next forwards its flags to child processes through NODE_OPTIONS, and
 * node refuses `--env-file` in NODE_OPTIONS ("--env-file= is not allowed in
 * NODE_OPTIONS"). The dev server died at startup with that message.
 */
import { readFileSync, existsSync } from 'node:fs';

/** Returns {} for a file that is not there -- absence is the caller's question. */
export function readEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}
