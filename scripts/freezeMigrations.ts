/**
 * Regenerates supabase/migrations_frozen.json -- the hash of every migration's
 * EXECUTABLE text (comments excluded, whitespace normalised).
 *
 * Run this ONLY when adding a new migration, never to silence a failure.
 * migrationImmutability.test.ts failing means an applied migration's SQL
 * changed, and regenerating the manifest would record the change rather than
 * reject it -- the single obvious way to satisfy that guard dishonestly.
 *
 *   npx tsx scripts/freezeMigrations.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import { executableSql } from '../supabase/executableSql';

const DIR = 'supabase/migrations';
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const manifest: Record<string, string> = {};
for (const f of files) {
  manifest[f] = createHash('sha256')
    .update(executableSql(readFileSync(join(DIR, f), 'utf8')))
    .digest('hex');
}
writeFileSync('supabase/migrations_frozen.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`frozen ${files.length} migrations`);
