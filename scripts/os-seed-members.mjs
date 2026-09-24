#!/usr/bin/env node
/**
 * T-OS0 Step 4: Seed fake members into a -prueba test gym.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/os-seed-members.mjs --gym-slug=bullbox-prueba
 *
 * Safety:
 *   - REFUSES to run against any gym whose slug does not end in '-prueba'.
 *   - All created clients are tagged '{seed}'.
 *   - No auth users are created (T-OS0 rule 5).
 *   - No writes to consumer tables.
 *
 * ⚠️  DO NOT RUN until Al reviews and approves.
 */
import { createClient } from '@supabase/supabase-js';

const SLUG_SUFFIX = '-prueba';
const TAG = 'seed';

const gymSlug = process.argv.find(a => a.startsWith('--gym-slug='))?.split('=')[1];
if (!gymSlug) {
  console.error('Usage: node scripts/os-seed-members.mjs --gym-slug=<slug>');
  process.exit(1);
}

if (!gymSlug.endsWith(SLUG_SUFFIX)) {
  console.error(`❌ REFUSED: gym slug '${gymSlug}' does not end in '${SLUG_SUFFIX}'.`);
  console.error('   This script only operates on test gyms.');
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

const FIRST_NAMES = [
  'Carlos', 'María', 'Andrés', 'Laura', 'Diego', 'Valentina',
  'Santiago', 'Camila', 'Julián', 'Daniela', 'Felipe', 'Isabella',
  'Mateo', 'Sofía', 'Sebastián', 'Natalia', 'David', 'Gabriela',
  'Nicolás', 'Paula',
];

const LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González',
  'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez',
];

const STATUSES = ['active', 'active', 'active', 'active', 'inactive', 'lapsed', 'lead'];

const members = [];
for (let i = 0; i < 20; i++) {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[i % LAST_NAMES.length];
  members.push({
    gym_id: gym.id,
    first_name: first,
    last_name: last,
    email: `seed.${first.toLowerCase()}.${last.toLowerCase()}${i}@prueba.test`,
    phone: `+5730000${String(i).padStart(4, '0')}`,
    status: STATUSES[i % STATUSES.length],
    tags: [TAG],
    created_at: new Date(Date.now() - (180 - i * 7) * 86400000).toISOString(),
  });
}

const { data: inserted, error: insertErr } = await supabase
  .from('clients')
  .upsert(members, { onConflict: 'gym_id,email', ignoreDuplicates: true })
  .select('id, first_name, last_name');

if (insertErr) {
  console.error('❌ Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`✅ Seeded ${inserted.length} members into gym '${gymSlug}' (${gym.id}).`);
console.log('   All tagged with seed. Use os-cleanup-seed.mjs to remove.');
