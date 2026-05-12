#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, no-console */
/**
 * Tribe.OS premium tier admin CLI.
 *
 * Usage from the tribe-v3 directory:
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=solo
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=team_studio
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --tier=solo --welcome
 *     (also sends the bilingual beta welcome email)
 *   node scripts/grant-tribe-os-premium.js --email=jane@studio.com --revoke
 *   node scripts/grant-tribe-os-premium.js --list
 *
 * Optional flags:
 *   --welcome       send the beta welcome email after a successful grant
 *   --free-days=N   free runway communicated in the welcome email (default 90)
 *   --lang=en|es    welcome email language (default 'en')
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
async function sendBetaWelcome({ email, name, freeDays, language, siteUrl }) {
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

  const text = [
    language === 'es' ? `${name}, estás dentro.` : `${name}, you're in.`,
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

  if (options && options.welcome) {
    try {
      await sendBetaWelcome({
        email: data.email,
        name: data.name || data.email.split('@')[0],
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
