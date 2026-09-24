#!/usr/bin/env node
/**
 * T-OS0 Step 4: Cleanup seed data from a -prueba test gym.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/os-cleanup-seed.mjs --gym-slug=bullbox-prueba
 *
 * Safety:
 *   - REFUSES to run against any gym whose slug does not end in '-prueba'.
 *   - Only deletes clients tagged 'seed'.
 *   - Cascading deletes handle client_attendance via ON DELETE CASCADE.
 *
 * ⚠️  DO NOT RUN until Al reviews and approves.
 */
import { createClient } from '@supabase/supabase-js';

const SLUG_SUFFIX = '-prueba';
const TAG = 'seed';

const gymSlug = process.argv.find(a => a.startsWith('--gym-slug='))?.split('=')[1];
if (!gymSlug) {
  console.error('Usage: node scripts/os-cleanup-seed.mjs --gym-slug=<slug>');
  process.exit(1);
}

if (!gymSlug.endsWith(SLUG_SUFFIX)) {
  console.error(`❌ REFUSED: gym slug '${gymSlug}' does not end in '${SLUG_SUFFIX}'.`);
  console.error('   This script only cleans up test gyms.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gym, error: gymErr } = await supabase
  .from('gyms')
  .select('id, slug')
  .eq('slug', gymSlug)
  .single();

if (gymErr || !gym) {
  console.error(`❌ Gym '${gymSlug}' not found.`, gymErr?.message);
  process.exit(1);
}

if (!gym.slug.endsWith(SLUG_SUFFIX)) {
  console.error(`❌ REFUSED: resolved gym slug '${gym.slug}' does not end in '${SLUG_SUFFIX}'.`);
  process.exit(1);
}

const { data: deleted, error: delErr } = await supabase
  .from('clients')
  .delete()
  .eq('gym_id', gym.id)
  .contains('tags', [TAG])
  .select('id');

if (delErr) {
  console.error('❌ Cleanup failed:', delErr.message);
  process.exit(1);
}

console.log(`✅ Cleaned up ${deleted.length} seed-tagged clients from gym '${gymSlug}' (${gym.id}).`);
