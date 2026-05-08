#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, no-console */
/**
 * Tribe.OS premium tier admin CLI.
 *
 * Usage from the tribe-v3 directory:
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=solo
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=team_studio
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --revoke
 *   node scripts/grant-tribe-os-premium.js --list
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from
 * .env.local in the repo root. Hits Supabase directly with the service
 * role client (bypasses RLS), so it does NOT require an admin login —
 * possession of the service-role key is the gate. Keep the key secret.
 *
 * Mirrors the semantics of lib/dal/tribeOSPremium.ts. The grant audit
 * trail records `granted_by = "cli:<host>"` so you can tell admin-route
 * grants apart from CLI grants in the users table.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createClient } = require('@supabase/supabase-js');

const VALID_TIERS = new Set(['solo', 'team_studio']);
const PREMIUM_SELECT =
  'tribe_os_tier, tribe_os_status, tribe_os_granted_at, tribe_os_granted_by, tribe_os_stripe_customer_id, tribe_os_stripe_subscription_id';

function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`);
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[body] = next;
        i++;
      } else {
        out[body] = true;
      }
    }
  }
  return out;
}

async function findUserByEmail(supabase, email) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.from('users').select('id, name, email').eq('email', normalized).single();
  if (error || !data) return null;
  return data;
}

async function grant(supabase, email, tier) {
  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`error: user not found with email "${email}"`);
    process.exit(2);
  }
  const grantedBy = `cli:${os.userInfo().username}@${os.hostname()}`;
  const { data, error } = await supabase
    .from('users')
    .update({
      tribe_os_tier: tier,
      tribe_os_granted_at: new Date().toISOString(),
      tribe_os_granted_by: grantedBy,
    })
    .eq('id', user.id)
    .select(`id, email, name, ${PREMIUM_SELECT}`)
    .single();
  if (error) {
    console.error('error:', error.message);
    process.exit(3);
  }
  console.log(`granted ${tier} to ${data.email} (${data.name})`);
  console.log(JSON.stringify(data, null, 2));
}

async function revoke(supabase, email) {
  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`error: user not found with email "${email}"`);
    process.exit(2);
  }
  const { error } = await supabase
    .from('users')
    .update({
      tribe_os_tier: null,
      tribe_os_status: null,
      tribe_os_granted_at: null,
      tribe_os_granted_by: null,
    })
    .eq('id', user.id);
  if (error) {
    console.error('error:', error.message);
    process.exit(3);
  }
  console.log(`revoked Tribe.OS premium from ${user.email}`);
}

async function list(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select(`id, email, name, ${PREMIUM_SELECT}`)
    .not('tribe_os_tier', 'is', null)
    .order('tribe_os_granted_at', { ascending: false });
  if (error) {
    console.error('error:', error.message);
    process.exit(3);
  }
  if (!data || data.length === 0) {
    console.log('no users currently on Tribe.OS premium');
    return;
  }
  console.log(`${data.length} user(s) on Tribe.OS premium:\n`);
  for (const row of data) {
    const grantedAt = row.tribe_os_granted_at ? new Date(row.tribe_os_granted_at).toISOString().slice(0, 19) : '?';
    const status = row.tribe_os_status ?? 'manual';
    console.log(`  ${row.email}  tier=${row.tribe_os_tier}  status=${status}  granted=${grantedAt}  by=${row.tribe_os_granted_by ?? '?'}`);
  }
}

function usage() {
  console.error('Usage:');
  console.error('  node scripts/grant-tribe-os-premium.js --email=<email> --tier=<solo|team_studio>');
  console.error('  node scripts/grant-tribe-os-premium.js --email=<email> --revoke');
  console.error('  node scripts/grant-tribe-os-premium.js --list');
  process.exit(1);
}

async function main() {
  loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env.local');
    process.exit(4);
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const args = parseArgs(process.argv);

  if (args.list) {
    await list(supabase);
    return;
  }
  if (!args.email || typeof args.email !== 'string') {
    usage();
  }
  if (args.revoke) {
    await revoke(supabase, args.email);
    return;
  }
  const tier = args.tier;
  if (!tier || !VALID_TIERS.has(tier)) {
    console.error(`error: --tier must be one of ${Array.from(VALID_TIERS).join(', ')}`);
    process.exit(1);
  }
  await grant(supabase, args.email, tier);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(99);
});
