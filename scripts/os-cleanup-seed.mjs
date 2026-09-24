#!/usr/bin/env node
/**
 * T-OS0 Step 4: Generate a SQL file that cleans up seed data from
 * the bullbox-prueba test gym. Al runs the output in the SQL editor.
 *
 * Usage:
 *   node scripts/os-cleanup-seed.mjs
 *
 * Output:
 *   scripts/generated/os-cleanup-seed.sql
 *
 * Safety:
 *   - Does NOT connect to the database. Generates SQL only.
 *   - Only deletes clients tagged 'seed' in the test gym.
 *   - The 4 existing clients (not tagged 'seed') are untouched.
 *   - Cascading deletes handle client_attendance and client_visits.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GYM_ID = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';

const sql = `-- T-OS0: Clean up seed data from bullbox-prueba
-- Run manually in Supabase SQL editor. Do NOT run from code.
-- Only deletes clients tagged 'seed'. The 4 existing clients are untouched.
-- Cascading deletes handle client_attendance and client_visits (ON DELETE CASCADE).

DELETE FROM clients
WHERE gym_id = '${GYM_ID}'
  AND 'seed' = ANY(tags);
`;

const outDir = join(import.meta.dirname, 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'os-cleanup-seed.sql');
writeFileSync(outPath, sql);
console.log(`✅ Generated ${outPath}`);
console.log(`   Deletes only seed-tagged clients in gym ${GYM_ID}.`);
console.log(`   Run this SQL in the Supabase SQL editor.`);

