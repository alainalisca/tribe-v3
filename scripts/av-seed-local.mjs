#!/usr/bin/env node
/**
 * T-AV0, Step 4.4. Fake data for the LOCAL stack, and nothing else, ever.
 *
 *   npm run av:seed          # goes through av-guard --db first
 *
 * Creates: athletes, instructors, one gym partner "BullBox (Prueba)" with
 * pass_active = true, sessions across the next 30 days, joins, and attendance.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE REFUSAL IS THE FIRST THING THIS FILE DOES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Before it reads a key, builds a client, or imports anything that could talk
 * to a network, it checks that the Supabase URL is localhost or 127.0.0.1 and
 * exits if it is not. Not because the order is elegant -- because CLAUDE.md
 * records what this program is protecting against by name: six invented
 * classes, one of them a 9:10 PM swimming session at a CrossFit box, written
 * into CrossFit BullBox's production record during venue testing, under the
 * gym's own name, one of them booked by a real athlete for a class that was
 * never going to happen.
 *
 * That is why the partner here is called "BullBox (Prueba)" and lives only in
 * a container on this Mac.
 *
 * A URL check is a capability check, not a name check: it asks where the
 * writes will LAND, which is the question. Asserting on a variable being
 * called something local, or on NODE_ENV, would be the "is this spelled the
 * way I expected" question that CLAUDE.md has four worked failures of.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT NEEDS A SCHEMA, AND IT SAYS SO RATHER THAN HALF-SEEDING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The local database gets its shape from supabase/av-local-schema.sql, pulled
 * from production by `npm run av:schema:pull`. If `public.users` is not there,
 * this stops on the first table with an explicit message instead of inserting
 * what it can and leaving a half-populated database that looks seeded.
 */
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readEnvFile } from './envFile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The same file av-guard checked and the dev server runs on, read with the
 * same parser. A seed that resolved its target differently from the guard
 * that just vouched for it would make the guard a statement about a different
 * environment -- which is the failure this repo keeps finding, an instrument
 * measuring something adjacent to the question.
 *
 * A real environment variable WINS, so an explicit
 * `SUPABASE_URL=https://... node scripts/av-seed-local.mjs` still reaches the
 * refusal below rather than being quietly overridden by the local file.
 */
const fileEnv = readEnvFile(path.join(ROOT, '.env.av.local'));
const pick = (key) =>
  process.env[key] !== undefined && process.env[key] !== '' ? process.env[key] : fileEnv[key];

// ── the refusal, before anything else ──────────────────────────────────────
const RAW_URL = pick('SUPABASE_URL') ?? pick('NEXT_PUBLIC_SUPABASE_URL') ?? '';

function isLocal(raw) {
  try {
    const h = new URL(raw).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

if (!isLocal(RAW_URL)) {
  console.error(
    `av-seed-local REFUSED\n\n` +
      `  SUPABASE_URL is ${RAW_URL === '' ? 'not set' : `"${RAW_URL}"`}, which is not a local stack.\n` +
      `  This script writes fake athletes, fake sessions and a fake gym partner.\n` +
      `  It runs against localhost or 127.0.0.1 and nowhere else.\n\n` +
      `  T-AV0 hard line, rule 2: no migration and no seed from this program\n` +
      `  touches the production database before the merge. CLAUDE.md records\n` +
      `  what happens when test data reaches a real gym's record: six invented\n` +
      `  classes on CrossFit BullBox's public page, one of them booked by a\n` +
      `  real athlete.\n\n` +
      `  Start the local stack with \`npm run db:start\` and use .env.av.local.\n`
  );
  process.exit(1);
}

const SERVICE_KEY = pick('SUPABASE_SERVICE_ROLE_KEY') ?? '';
if (!SERVICE_KEY) {
  console.error(
    `av-seed-local FAILED: SUPABASE_SERVICE_ROLE_KEY is not set.\n` +
      `  It is the LOCAL stack's key, printed by \`supabase status\`. It is not\n` +
      `  a secret and it is not production's.\n`
  );
  process.exit(1);
}

const db = createClient(RAW_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Stable ids, so re-running the seed updates rather than duplicating. */
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const PEOPLE = [
  { id: ID(1), name: 'Ana Prueba', email: 'ana@av.local', role: 'athlete', sports: ['Running', 'Yoga'] },
  { id: ID(2), name: 'Beto Prueba', email: 'beto@av.local', role: 'athlete', sports: ['CrossFit'] },
  { id: ID(3), name: 'Caro Prueba', email: 'caro@av.local', role: 'athlete', sports: ['Swimming'] },
  { id: ID(4), name: 'Diego Prueba', email: 'diego@av.local', role: 'athlete', sports: ['Cycling'] },
  { id: ID(5), name: 'Elena Prueba', email: 'elena@av.local', role: 'instructor', sports: ['Yoga'] },
  { id: ID(6), name: 'Felipe Prueba', email: 'felipe@av.local', role: 'instructor', sports: ['CrossFit'] },
  { id: ID(7), name: 'BullBox (Prueba)', email: 'bullbox@av.local', role: 'gym', sports: ['CrossFit'] },
];

const PASSWORD = 'tribe-local-1234';

/** Today + n days, as YYYY-MM-DD, in local time -- the app stores a DATE. */
function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function die(what, error) {
  console.error(
    `av-seed-local FAILED at "${what}": ${error?.message ?? error}\n\n` +
      (String(error?.message ?? '').match(/does not exist|schema cache/i)
        ? `  The local database has no schema yet. Run \`npm run av:schema:pull\`\n` +
          `  (production, schema only, no rows) and then \`npm run db:reset\`.\n` +
          `  Stopping here on purpose: a half-seeded database looks seeded.\n`
        : '')
  );
  process.exit(1);
}

async function seedAuthUsers() {
  for (const p of PEOPLE) {
    // Delete-then-create so a re-run is idempotent without needing to reason
    // about which of the auth tables a partial previous run touched.
    await db.auth.admin.deleteUser(p.id).catch(() => {});
    const { error } = await db.auth.admin.createUser({
      id: p.id,
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: p.name },
    });
    if (error && !/already/i.test(error.message)) die(`auth user ${p.email}`, error);
  }
  return PEOPLE.length;
}

async function seedProfiles() {
  const rows = PEOPLE.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    bio: `Cuenta de prueba local (${p.role}). No es una persona real.`,
    location: 'Medellín',
    sports: p.sports,
  }));
  const { error } = await db.from('users').upsert(rows, { onConflict: 'id' });
  if (error) die('public.users', error);
  return rows.length;
}

async function seedPartner() {
  const row = {
    user_id: ID(7),
    business_name: 'BullBox (Prueba)',
    business_type: 'gym',
    status: 'active',
    address: 'Calle Falsa 123, Medellín',
    pass_active: true,
  };
  const { data, error } = await db
    .from('featured_partners')
    .upsert(row, { onConflict: 'user_id' })
    .select('id')
    .maybeSingle();
  if (error) die('featured_partners', error);
  return data?.id ?? null;
}

/**
 * Sessions across the next 30 days, plus three in the PAST.
 *
 * The past ones are the "attendance" half of Step 4.4. There is no
 * `attended` column on session_participants -- this app models having trained
 * with someone as a CONFIRMED join on a session whose date has gone by, which
 * is what lib/dal/participants.ts reads for its visibility tiers. Seeding a
 * boolean that does not exist would have produced a database where every tier
 * resolves to 1 and every tier test passes vacuously.
 */
const DAY_OFFSETS = [-14, -7, -3, ...Array.from({ length: 15 }, (_, k) => k * 2)];

async function seedSessions(partnerId) {
  const hosts = [ID(5), ID(6), ID(7)];
  const sports = ['Yoga', 'CrossFit', 'Running', 'Swimming', 'Cycling'];
  const rows = DAY_OFFSETS.map((offset, i) => ({
    id: ID(1000 + i),
    creator_id: hosts[i % hosts.length],
    sport: sports[i % sports.length],
    title: `Sesión de prueba ${i + 1}`,
    location: 'BullBox (Prueba), Medellín',
    date: dayOffset(offset),
    start_time: '07:00:00',
    duration: 60,
    max_participants: 12,
    status: 'active',
    join_policy: 'open',
    partner_id: i % 4 === 0 ? partnerId : null,
  }));
  const { error } = await db.from('sessions').upsert(rows, { onConflict: 'id' });
  if (error) die('sessions', error);
  return rows.length;
}

async function seedJoins(sessionCount) {
  const athletes = PEOPLE.filter((p) => p.role === 'athlete').map((p) => p.id);
  const rows = [];
  for (let i = 0; i < sessionCount; i++) {
    for (const [n, athlete] of athletes.entries()) {
      if ((i + n) % 3 !== 0) continue;
      rows.push({
        session_id: ID(1000 + i),
        user_id: athlete,
        status: 'confirmed',
      });
    }
  }
  const { error } = await db
    .from('session_participants')
    .upsert(rows, { onConflict: 'session_id,user_id' });
  if (error) die('session_participants', error);
  return rows.length;
}

const authUsers = await seedAuthUsers();
const profiles = await seedProfiles();
const partnerId = await seedPartner();
const sessions = await seedSessions(partnerId);
const joins = await seedJoins(sessions);

// Print what was WRITTEN, not just that it finished. A seed that reports
// "done" over zero rows is indistinguishable from one that worked.
console.log(
  `av-seed-local OK against ${RAW_URL}\n` +
    `  auth users        ${authUsers}\n` +
    `  profiles          ${profiles}\n` +
    `  partner           BullBox (Prueba)  pass_active=true  id=${partnerId ?? 'n/a'}\n` +
    `  sessions          ${sessions}  (3 past, the rest today .. +28 days)\n` +
    `  joins             ${joins}\n` +
    `  password for every test account: ${PASSWORD}\n` +
    `  mail for the local stack is caught by inbucket on http://127.0.0.1:54324\n`
);
