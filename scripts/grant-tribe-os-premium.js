#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, no-console */
/**
 * Tribe.OS premium tier admin CLI.
 *
 * Usage from the tribe-v3 directory:
 *   # Grant premium (creates a gym if none, adds user as owner)
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=solo
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=team_studio
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=solo --welcome
 *
 *   # Revoke premium (also flips the gym status to canceled)
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --revoke
 *
 *   # Add a coach to an existing gym (does NOT grant them premium —
 *   # the gym owner's subscription covers the whole roster)
 *   node scripts/grant-tribe-os-premium.js --add-coach \
 *     --gym-owner=jane@studio.com --coach-email=alex@studio.com [--role=coach|assistant]
 *
 *   # Remove a coach from a gym (cannot remove the owner)
 *   node scripts/grant-tribe-os-premium.js --remove-coach \
 *     --gym-owner=jane@studio.com --coach-email=alex@studio.com
 *
 *   # Print every premium user
 *   node scripts/grant-tribe-os-premium.js --list
 *
 * Optional flags:
 *   --welcome       send the beta welcome email after a successful grant
 *   --free-days=N   free runway communicated in the welcome email (default 90)
 *   --lang=en|es    welcome email language (default 'en')
 *   --role=coach|assistant   role for --add-coach (default 'coach')
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
const { Resend } = require('resend');

const VALID_TIERS = new Set(['solo', 'team_studio']);
const VALID_COACH_ROLES = new Set(['coach', 'assistant']);
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

/**
 * Send a text-only beta welcome email via Resend. The richer HTML
 * version lives in lib/email/tribeOsBetaWelcome.ts for server-side use;
 * the CLI uses a minimal text template to avoid a TS build step.
 *
 * Throws on Resend error so the caller can decide. The grant CLI logs
 * and continues — the grant should succeed even if the email fails.
 */
async function sendBetaWelcome({ email, name, gymName, freeDays, language, siteUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not set in .env.local');
  }
  const resend = new Resend(apiKey);
  const subject =
    language === 'es' ? 'Bienvenido a la beta de Tribe.OS' : 'Welcome to the Tribe.OS beta';
  const intro =
    language === 'es'
      ? `Tienes acceso completo a Tribe.OS premium gratis durante los próximos ${freeDays} días.`
      : `You have full Tribe.OS premium access free for the next ${freeDays} days.`;
  const links =
    language === 'es'
      ? [
          `Gestiona tus clientes: ${siteUrl}/os/clients`,
          `Crea una sesión pagada: ${siteUrl}/create`,
          `Ve tus ingresos: ${siteUrl}/os/revenue`,
        ]
      : [
          `Manage your clients: ${siteUrl}/os/clients`,
          `Create a paid session: ${siteUrl}/create`,
          `See your revenue: ${siteUrl}/os/revenue`,
        ];
  const ask =
    language === 'es'
      ? `Lo que te pedimos: úsalo semanalmente con al menos una sesión pagada, avísanos rápido cuando algo falle, y haz una llamada de 30 minutos al final del mes.`
      : `What we are asking: use it weekly with at least one real paid session, tell us fast when something breaks, and sit for a 30-minute feedback call at the end of the month.`;
  const after =
    language === 'es'
      ? `Después de ${freeDays} días, eliges: treinta dólares al mes o quince por ciento de participación en ingresos.`
      : `After ${freeDays} days you choose: thirty dollars per month or fifteen percent revenue share.`;

  const greeting = gymName
    ? language === 'es'
      ? `Bienvenido a Tribe.OS, ${gymName}.`
      : `Welcome to Tribe.OS, ${gymName}.`
    : language === 'es'
      ? `${name}, estás dentro.`
      : `${name}, you're in.`;

  const text = [
    greeting,
    '',
    intro,
    '',
    ...links,
    '',
    ask,
    '',
    after,
    '',
    'Alain',
    'A Plus Fitness LLC',
  ].join('\n');

  await resend.emails.send({
    from: 'Tribe <tribe@aplusfitnessllc.com>',
    to: email,
    subject,
    text,
  });
}

// FNV-1a 32-bit hash → 6 hex chars. Mirrors deriveGymSlug in
// lib/dal/gyms.ts and the SQL in migration 069 so all three paths
// produce stable, deterministic slugs.
function simpleHash6(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

function deriveGymSlug(name, uniquenessSeed) {
  const base = String(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeBase = base.length > 0 ? base : 'gym';
  return `${safeBase}-${simpleHash6(uniquenessSeed)}`.slice(0, 80);
}

/**
 * Ensure the user has a gym, owned by them. Idempotent. Returns the
 * gym row. Called as part of grant() so the gym-tenant scaffolding is
 * in place before any tenant data lands on the user.
 *
 * Mirrors lib/dal/gyms.ts createGym + gymCoaches.ts addCoachToGym but
 * inlined here so the CLI stays a single-file JS script.
 */
async function ensureGymForUser(supabase, user, tier, grantedBy) {
  // Look for an existing gym owned by the user (any deleted_at).
  const existing = await supabase
    .from('gyms')
    .select(
      'id, name, slug, owner_user_id, tribe_os_tier, tribe_os_status, tribe_os_granted_at, tribe_os_granted_by, deleted_at'
    )
    .eq('owner_user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error(`gym lookup failed: ${existing.error.message}`);
  }

  if (existing.data) {
    // Idempotent refresh: ensure tier/status/granted_at match the
    // grant we just performed on the user row.
    const updates = {
      tribe_os_tier: tier,
      tribe_os_status: null,
      tribe_os_granted_at: new Date().toISOString(),
      tribe_os_granted_by: grantedBy,
    };
    const { data, error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', existing.data.id)
      .select('id, name, slug')
      .single();
    if (error) {
      throw new Error(`gym update failed: ${error.message}`);
    }
    // Owner row idempotent upsert.
    await supabase
      .from('gym_coaches')
      .upsert({ gym_id: data.id, user_id: user.id, role: 'owner' }, { onConflict: 'gym_id,user_id' });
    return { gym: data, created: false };
  }

  const name = user.name || (user.email ? user.email.split('@')[0] : 'Solo Practice');
  const slug = deriveGymSlug(name, user.id);
  const insertRes = await supabase
    .from('gyms')
    .insert({
      name,
      slug,
      owner_user_id: user.id,
      tribe_os_tier: tier,
      tribe_os_status: null,
      tribe_os_granted_at: new Date().toISOString(),
      tribe_os_granted_by: grantedBy,
    })
    .select('id, name, slug')
    .single();
  if (insertRes.error) {
    throw new Error(`gym create failed: ${insertRes.error.message}`);
  }
  await supabase
    .from('gym_coaches')
    .upsert(
      { gym_id: insertRes.data.id, user_id: user.id, role: 'owner' },
      { onConflict: 'gym_id,user_id' }
    );
  return { gym: insertRes.data, created: true };
}

async function grant(supabase, email, tier, options) {
  const user = await findUserByEmail(supabase, email);
  if (!user) {
    console.error(`error: user not found with email "${email}"`);
    process.exit(2);
  }
  const grantedBy = `cli:${os.userInfo().username}@${os.hostname()}`;
  // Reset tribe_os_status to NULL. By design, manually-granted users
  // sit in the "design partner" state (NULL status), which the
  // isTribeOSPremiumActive check treats as active. Without this reset,
  // re-granting a user whose Stripe subscription was previously
  // canceled would leave status='canceled' in place, causing the
  // premium gate to fail despite the new grant. We preserve
  // tribe_os_stripe_customer_id and tribe_os_stripe_subscription_id
  // so the audit trail of any prior Stripe relationship survives.
  const { data, error } = await supabase
    .from('users')
    .update({
      tribe_os_tier: tier,
      tribe_os_status: null,
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

  // Ensure gym-tenant scaffolding (migration 068+). The gym is the
  // canonical billing tenant going forward; the users.tribe_os_*
  // columns above stay in sync for backward compat with code that
  // hasn't moved to the gym-aware DAL yet.
  let gymName = null;
  try {
    const { gym, created } = await ensureGymForUser(supabase, data, tier, grantedBy);
    console.log(`${created ? 'created' : 'refreshed'} gym ${gym.slug} (${gym.id}) for ${data.email}`);
    gymName = gym.name;
  } catch (err) {
    console.error(`gym scaffold FAILED for ${data.email}: ${err.message}`);
    console.error('(the user-row grant succeeded; the legacy RLS path still works)');
  }

  if (options && options.welcome) {
    try {
      await sendBetaWelcome({
        email: data.email,
        name: data.name || data.email.split('@')[0],
        gymName,
        freeDays: options.freeDays,
        language: options.language,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app',
      });
      console.log(`welcome email sent to ${data.email} (lang=${options.language}, freeDays=${options.freeDays})`);
    } catch (err) {
      console.error(`welcome email FAILED for ${data.email}: ${err.message}`);
      console.error('(the grant succeeded; send the welcome email manually)');
    }
  }
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

  // Mirror the revoke onto the user's gym(s). Tier is cleared and
  // status flipped to 'canceled' to match the Stripe-flow semantics.
  // Stripe IDs preserved for re-grant attribution.
  const { error: gymErr } = await supabase
    .from('gyms')
    .update({
      tribe_os_tier: null,
      tribe_os_status: 'canceled',
    })
    .eq('owner_user_id', user.id)
    .is('deleted_at', null);
  if (gymErr) {
    console.error(`gym revoke FAILED for ${user.email}: ${gymErr.message}`);
    console.error('(the user-row revoke succeeded; check gyms.tribe_os_status manually)');
  } else {
    console.log(`gym status flipped to canceled for owner ${user.email}`);
  }
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

/**
 * Add a user (by email) to the gym owned by another user (by email)
 * as a coach. Does NOT grant the new coach Tribe.OS premium —
 * billing is scoped to the gym, and the owner's subscription covers
 * the whole roster. The new coach must already have a Tribe account.
 *
 * RLS bypass is fine here because:
 *   - We're using the service role
 *   - The gym lookup is by owner_user_id, which is unambiguous
 *   - The gym_coaches table has no policies that could block an
 *     admin-driven INSERT
 */
async function addCoach(supabase, gymOwnerEmail, coachEmail, role) {
  const owner = await findUserByEmail(supabase, gymOwnerEmail);
  if (!owner) {
    console.error(`error: gym owner not found with email "${gymOwnerEmail}"`);
    process.exit(2);
  }
  const coach = await findUserByEmail(supabase, coachEmail);
  if (!coach) {
    console.error(`error: coach user not found with email "${coachEmail}"`);
    console.error('(the user must already have a Tribe account before being added as a coach)');
    process.exit(2);
  }

  // Find the owner's gym. If they have multiple, use the first
  // active one (rare today — most owners have exactly one).
  const { data: gym, error: gymErr } = await supabase
    .from('gyms')
    .select('id, name, slug')
    .eq('owner_user_id', owner.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (gymErr) {
    console.error('error: gym lookup failed:', gymErr.message);
    process.exit(3);
  }
  if (!gym) {
    console.error(`error: ${gymOwnerEmail} owns no active gym. Grant them premium first.`);
    process.exit(2);
  }

  // Idempotent upsert. If the user is already a coach, the upsert
  // returns the existing row instead of erroring on the PK conflict.
  const { error: upsertErr } = await supabase
    .from('gym_coaches')
    .upsert({ gym_id: gym.id, user_id: coach.id, role }, { onConflict: 'gym_id,user_id' });
  if (upsertErr) {
    console.error('error: addCoach failed:', upsertErr.message);
    process.exit(3);
  }

  console.log(`added ${coach.email} (${coach.name}) to gym ${gym.slug} as ${role}`);
}

/**
 * Remove a user (by email) from the gym owned by another user (by
 * email). Refuses to remove the owner themselves — every gym needs
 * an owner. Same semantics as removeCoachFromGym in the DAL.
 */
async function removeCoach(supabase, gymOwnerEmail, coachEmail) {
  const owner = await findUserByEmail(supabase, gymOwnerEmail);
  if (!owner) {
    console.error(`error: gym owner not found with email "${gymOwnerEmail}"`);
    process.exit(2);
  }
  const coach = await findUserByEmail(supabase, coachEmail);
  if (!coach) {
    console.error(`error: coach user not found with email "${coachEmail}"`);
    process.exit(2);
  }

  const { data: gym, error: gymErr } = await supabase
    .from('gyms')
    .select('id, name, slug, owner_user_id')
    .eq('owner_user_id', owner.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (gymErr) {
    console.error('error: gym lookup failed:', gymErr.message);
    process.exit(3);
  }
  if (!gym) {
    console.error(`error: ${gymOwnerEmail} owns no active gym.`);
    process.exit(2);
  }
  if (gym.owner_user_id === coach.id) {
    console.error('error: cannot remove the gym owner. Transfer ownership first.');
    process.exit(2);
  }

  const { error: delErr, count } = await supabase
    .from('gym_coaches')
    .delete({ count: 'exact' })
    .eq('gym_id', gym.id)
    .eq('user_id', coach.id);
  if (delErr) {
    console.error('error: removeCoach failed:', delErr.message);
    process.exit(3);
  }
  if (!count) {
    console.log(`note: ${coach.email} was not a coach in ${gym.slug} (nothing to remove)`);
    return;
  }
  console.log(`removed ${coach.email} from gym ${gym.slug}`);
}

function usage() {
  console.error('Usage:');
  console.error('  node scripts/grant-tribe-os-premium.js --email=<email> --tier=<solo|team_studio>');
  console.error('  node scripts/grant-tribe-os-premium.js --email=<email> --revoke');
  console.error('  node scripts/grant-tribe-os-premium.js --list');
  console.error('  node scripts/grant-tribe-os-premium.js --add-coach --gym-owner=<email> --coach-email=<email> [--role=coach|assistant]');
  console.error('  node scripts/grant-tribe-os-premium.js --remove-coach --gym-owner=<email> --coach-email=<email>');
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

  // Coach management modes — handled before the --email gate
  // because they use different args (--gym-owner + --coach-email).
  if (args['add-coach'] === true || args['add-coach'] === 'true') {
    const gymOwner = args['gym-owner'];
    const coachEmail = args['coach-email'];
    if (typeof gymOwner !== 'string' || typeof coachEmail !== 'string') {
      console.error('error: --add-coach requires --gym-owner=<email> and --coach-email=<email>');
      process.exit(1);
    }
    const role = typeof args.role === 'string' && VALID_COACH_ROLES.has(args.role) ? args.role : 'coach';
    await addCoach(supabase, gymOwner, coachEmail, role);
    return;
  }
  if (args['remove-coach'] === true || args['remove-coach'] === 'true') {
    const gymOwner = args['gym-owner'];
    const coachEmail = args['coach-email'];
    if (typeof gymOwner !== 'string' || typeof coachEmail !== 'string') {
      console.error('error: --remove-coach requires --gym-owner=<email> and --coach-email=<email>');
      process.exit(1);
    }
    await removeCoach(supabase, gymOwner, coachEmail);
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

  // Optional welcome-email flags. Default freeDays to 90 per Week 4 spec.
  const welcome = args.welcome === true || args.welcome === 'true';
  const freeDaysRaw = args['free-days'];
  const freeDays =
    typeof freeDaysRaw === 'string' && /^\d+$/.test(freeDaysRaw) ? Number(freeDaysRaw) : 90;
  const language = args.lang === 'es' ? 'es' : 'en';

  await grant(supabase, args.email, tier, { welcome, freeDays, language });
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(99);
});
