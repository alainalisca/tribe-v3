#!/usr/bin/env node
/**
 * T-AV22. The Tribe Athletes seed for the LOCAL stack, and nothing else, ever.
 *
 *   npm run av:seed                           # full seed; calls this at the end
 *   node scripts/av-seed-athletes.mjs         # programs, athletes and leads only
 *
 * The second form is the reset the T-AV22 proof, probe and mutation scripts
 * run between writes: it rebuilds both seed partners' programs, athletes and
 * pass leads from the tables below, with fixed ids and pass codes, in about a
 * second, and touches no auth user.
 *
 * NEVER scripts/seed-bullbox.sql. That file seeds the real BullBox in
 * production (recon F9). Everything here is "(Prueba)".
 *
 * THE EXPECTED LEDGER is written before any code, in
 * supabase/recon/t-av22-proof.LOCAL.sh, and derived by hand from LEADS below:
 *
 *   Ana   captain   invited 9  not credited 0  showed 9   joined 0  retained 0  owed 0  settled 0  ready false
 *   Beto  captain   invited 10 not credited 0  showed 10  joined 1  retained 0  owed 0  settled 0  ready true
 *   Caro  athlete   invited 7  not credited 5  showed 6   joined 3  retained 1  owed 2  settled 1  ready false
 *
 * Beto's join (B10) is a captain's join: bonus_eligible false, so joined 1
 * and owed 0. Caro's not credited: C8 already_member, C9 self_email, C10
 * self_whatsapp, C11 returning (same email as P0), C12 duplicate (same guest
 * as C1, neither attended, C1 earlier).
 */
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readEnvFile } from './envFile.mjs';
import { isLocalDbUrl } from './avLocalDb.mjs';

export const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PASSWORD = 'tribe-local-1234';
const OWNER_A = ID(7);
const OWNER_B = ID(9);
const ELENA = ID(5);
const FELIPE = ID(6);
const GABI = ID(10);

/**
 * Stable ids for the two seed partners (2026-10-01), so a reseed keeps every
 * URL that names one, such as the door list /atletas/gym/{id}/puerta/.
 * Stable ids alone did NOT make the seed re-runnable; see clearSeedPartnerLeads.
 */
export const PARTNER_A_ID = ID(7000);
export const PARTNER_B_ID = ID(7001);
const SEED_PARTNER_SLUGS = ['bullbox-prueba', 'otro-gym-prueba'];

/** People T-AV0's seed does not create. */
export const EXTRA_PEOPLE = [
  { id: ID(8), name: 'Admin Prueba', email: 'admin@av.local', isAdmin: true, instructor: false },
  { id: OWNER_B, name: 'Otro Gym (Prueba)', email: 'otro@av.local', isAdmin: false, instructor: false },
  { id: GABI, name: 'Gabi Prueba', email: 'gabi@av.local', isAdmin: false, instructor: true },
];

/** WhatsApp already E.164: the table refuses anything else (decision 6). */
export const ATHLETES = [
  { key: 'ana', id: ID(2001), userId: ID(1), level: 'captain', refCode: 'ANA-7KQ', email: 'ana@av.local', whatsapp: '+573001110001' },
  { key: 'beto', id: ID(2002), userId: ID(2), level: 'captain', refCode: 'BETO-M3X', email: 'beto@av.local', whatsapp: '+573001110002' },
  { key: 'caro', id: ID(2003), userId: ID(3), level: 'athlete', refCode: 'CARO-P9R', email: 'caro@av.local', whatsapp: '+573001110003' },
];

const ANA_GUESTS = ['Andres', 'Beatriz', 'Camilo', 'Daniela', 'Esteban', 'Fabiola', 'Gustavo', 'Helena', 'Ivan'];
const BETO_GUESTS = ['Julia', 'Kevin', 'Laura', 'Mateo', 'Nora', 'Oscar', 'Paula', 'Quique', 'Rosa', 'Samuel'];

/**
 * @typedef {object} SeedLead
 * @property {string} key
 * @property {string} code
 * @property {'A' | 'B'} partner
 * @property {string | null} athlete
 * @property {string} name
 * @property {string} email
 * @property {string} whatsapp
 * @property {number} created
 * @property {number} [attended]
 * @property {'joined' | 'follow_up' | 'not_now' | 'already_member'} [outcome]
 * @property {number} [outcomeAt]
 * @property {number} [retained]
 * @property {boolean} [bonusEligible]
 * @property {number} [settled]
 */

/**
 * Every lead, one line each. Days are relative to the moment of seeding
 * (negative is the past). `athlete` null means not attributed.
 *
 * @type {SeedLead[]}
 */
export const LEADS = [
  { key: 'P0', code: 'AV-PLAN', partner: 'A', athlete: null, name: 'Maria Vuelve', email: 'maria.vuelve@guest.local', whatsapp: '+573005550000', created: -60, attended: -59 },
  ...ANA_GUESTS.map((first, i) => ({
    key: `A${i + 1}`, code: `AV-ANA${'ABCDEFGHI'[i]}`, partner: 'A', athlete: 'ana', name: `${first} Invitado`,
    // A9 carries the guest-email user's address (Diego), for the probe matrix.
    email: i === 8 ? 'diego@av.local' : `ana.g${i + 1}@guest.local`,
    whatsapp: `+5730055510${String(i + 1).padStart(2, '0')}`, created: -(2 * (i + 1)), attended: -(2 * (i + 1)) + 0.5,
  })),
  ...BETO_GUESTS.map((first, i) => ({
    key: `B${i + 1}`, code: `AV-BET${'ABCDEFGHIJ'[i]}`, partner: 'A', athlete: 'beto', name: `${first} Invitada`,
    email: `beto.g${i + 1}@guest.local`, whatsapp: `+5730055520${String(i + 1).padStart(2, '0')}`,
    created: -(2 * (i + 1) + 1), attended: -(2 * (i + 1) + 1) + 0.5,
    // B10: a captain's join. Counts as joined, never as a bonus owed.
    ...(i === 9 ? { outcome: 'joined', outcomeAt: -20, bonusEligible: false } : {}),
  })),
  { key: 'C1', code: 'AV-CARA', partner: 'A', athlete: 'caro', name: 'Lucia Uno', email: 'lucia@guest.local', whatsapp: '+573005553001', created: -3 },
  { key: 'C2', code: 'AV-CARB', partner: 'A', athlete: 'caro', name: 'Marta Dos', email: 'marta@guest.local', whatsapp: '+573005553002', created: -8, attended: -7 },
  { key: 'C3', code: 'AV-CARC', partner: 'A', athlete: 'caro', name: 'Nico Tres', email: 'nico@guest.local', whatsapp: '+573005553003', created: -7, attended: -6, outcome: 'joined', outcomeAt: -5, bonusEligible: true },
  { key: 'C4', code: 'AV-CARD', partner: 'A', athlete: 'caro', name: 'Olga Cuatro', email: 'olga@guest.local', whatsapp: '+573005553004', created: -50, attended: -49, outcome: 'joined', outcomeAt: -45, retained: -10, bonusEligible: true },
  { key: 'C5', code: 'AV-CARE', partner: 'A', athlete: 'caro', name: 'Pedro Cinco', email: 'pedro@guest.local', whatsapp: '+573005553005', created: -42, attended: -41, outcome: 'joined', outcomeAt: -40, bonusEligible: true, settled: -2 },
  { key: 'C6', code: 'AV-CARF', partner: 'A', athlete: 'caro', name: 'Quina Seis', email: 'quina@guest.local', whatsapp: '+573005553006', created: -6, attended: -5, outcome: 'follow_up', outcomeAt: -5 },
  { key: 'C7', code: 'AV-CARG', partner: 'A', athlete: 'caro', name: 'Raul Siete', email: 'raul@guest.local', whatsapp: '+573005553007', created: -9, attended: -8, outcome: 'not_now', outcomeAt: -8 },
  { key: 'C8', code: 'AV-CARH', partner: 'A', athlete: 'caro', name: 'Sara Ocho', email: 'sara@guest.local', whatsapp: '+573005553008', created: -4, attended: -3, outcome: 'already_member', outcomeAt: -3 },
  { key: 'C9', code: 'AV-CARJ', partner: 'A', athlete: 'caro', name: 'Caro Otra', email: 'caro@av.local', whatsapp: '+573005553009', created: -5, attended: -4 },
  { key: 'C10', code: 'AV-CARK', partner: 'A', athlete: 'caro', name: 'Tomas Diez', email: 'tomas@guest.local', whatsapp: '+573001110003', created: -5, attended: -4 },
  { key: 'C11', code: 'AV-CARL', partner: 'A', athlete: 'caro', name: 'Maria Otra', email: 'maria.vuelve@guest.local', whatsapp: '+573005553011', created: -2, attended: -1 },
  { key: 'C12', code: 'AV-CARM', partner: 'A', athlete: 'caro', name: 'Lucia Doce', email: 'lucia@guest.local', whatsapp: '+573005553012', created: -1 },
  { key: 'X1', code: 'AV-OTRO', partner: 'B', athlete: null, name: 'Otra Invitada', email: 'otra@guest.local', whatsapp: '+573005559999', created: -2, attended: -1 },
];

const PROGRAM_A = {
  is_active: true,
  welcome_offer_en: 'First month at 20% off if you join this week.',
  welcome_offer_es: 'Primer mes con 20% de descuento si te inscribes esta semana.',
  showup_reward_en: 'One free class for every guest who shows up.',
  showup_reward_es: 'Una clase gratis por cada invitado que llegue.',
  class_access_en: 'Open box, Monday to Saturday.',
  class_access_es: 'Box abierto, de lunes a sábado.',
  conversion_bonus_cop: 50000,
  conversion_bonus_note_en: 'Paid by the gym at the end of each month.',
  conversion_bonus_note_es: 'Lo paga el gimnasio al final de cada mes.',
  retention_days: 30,
  promote_at_showups: 10,
  max_athletes: 5,
};

const at = (days) => (days === undefined ? null : new Date(Date.now() + days * 86_400_000).toISOString());
const dayOf = (days) => at(days).slice(0, 10);

function fail(what, error) {
  throw new Error(`av-seed-athletes FAILED at "${what}": ${error?.message ?? error}`);
}

async function seedExtraPeople(db) {
  for (const p of EXTRA_PEOPLE) {
    await db.auth.admin.deleteUser(p.id).catch(() => {});
    const { error } = await db.auth.admin.createUser({
      id: p.id, email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { name: p.name },
    });
    if (error && !/already/i.test(error.message)) fail(`auth user ${p.email}`, error);
  }
  // is_admin through the service role: prevent_is_admin_self_update only
  // refuses when auth.uid() is set, and it is not here.
  const { error } = await db.from('users').upsert(
    EXTRA_PEOPLE.map((p) => ({
      id: p.id, email: p.email, name: p.name, location: 'Medellín',
      bio: 'Cuenta de prueba local. No es una persona real.',
      is_admin: p.isAdmin, is_instructor: p.instructor,
    })),
    { onConflict: 'id' }
  );
  if (error) fail('public.users (extra people)', error);
}

/**
 * Clear both seed partners' pass leads. `npm run av:seed` calls this BEFORE it
 * deletes any seed account (2026-10-01).
 *
 * Why it has to run first: deleting a seed owner's auth user cascades to
 * public.users and then to featured_partners, while pass_leads.partner_id is
 * ON DELETE SET NULL. So by the time the partner is re-created, its old leads
 * have partner_id NULL, the delete-by-partner_id further down misses them, and
 * the re-insert fails on pass_leads_pass_code_key. That is exactly how a second
 * `npm run av:seed` on one database failed.
 *
 * The second delete catches leads a run before this fix already orphaned:
 * partner_id NULL, slug still one of the two seed slugs. Local stack only.
 *
 * Proven 2026-10-01: with the call removed, the second of two runs fails on
 * pass_leads_pass_code_key again; restored, the next run clears those orphans.
 */
export async function clearSeedPartnerLeads(db) {
  const owned = await db.from('featured_partners').select('id').in('user_id', [OWNER_A, OWNER_B]);
  if (owned.error) fail('featured_partners (find seed partners)', owned.error);
  const ids = owned.data.map((row) => row.id);
  if (ids.length > 0) {
    const r = await db.from('pass_leads').delete().in('partner_id', ids);
    if (r.error) fail('pass_leads (clear seed partners)', r.error);
  }
  const orphans = await db.from('pass_leads').delete().is('partner_id', null).in('slug', SEED_PARTNER_SLUGS);
  if (orphans.error) fail('pass_leads (clear orphaned seed leads)', orphans.error);
}

async function partnerOf(db, ownerId, what) {
  const { data, error } = await db.from('featured_partners').select('id, slug').eq('user_id', ownerId).maybeSingle();
  if (error) fail(what, error);
  if (!data) fail(what, 'not found; run the full `npm run av:seed` first');
  return data;
}

/** Programs, athletes, coaches, routing and leads for both seed partners. */
export async function seedAthletePrograms(db, { withPeople = true } = {}) {
  if (withPeople) await seedExtraPeople(db);

  const a = await partnerOf(db, OWNER_A, 'BullBox (Prueba)');
  if (withPeople) {
    const { error } = await db.from('featured_partners').upsert(
      { id: PARTNER_B_ID, user_id: OWNER_B, business_name: 'Otro Gym (Prueba)', business_type: 'gym', status: 'active',
        address: 'Carrera Falsa 456, Medellín', pass_active: true },
      { onConflict: 'user_id' }
    );
    if (error) fail('featured_partners (second partner)', error);
  }
  const b = await partnerOf(db, OWNER_B, 'Otro Gym (Prueba)');
  const partnerOfKey = { A: a, B: b };

  // F10: without a routing row /pase/bullbox-prueba renders the inactive page.
  let r = await db.from('partner_lead_routing').upsert({ partner_id: a.id, lead_email: 'bullbox@av.local' }, { onConflict: 'partner_id' });
  if (r.error) fail('partner_lead_routing', r.error);

  r = await db.from('partner_instructors').upsert(
    [
      { partner_id: a.id, instructor_id: ELENA, is_active: true },
      { partner_id: a.id, instructor_id: FELIPE, is_active: false },
      { partner_id: b.id, instructor_id: GABI, is_active: true },
    ],
    { onConflict: 'partner_id,instructor_id' }
  );
  if (r.error) fail('partner_instructors', r.error);

  // Leads first (they reference athletes), then athletes, then programs.
  r = await db.from('pass_leads').delete().in('partner_id', [a.id, b.id]);
  if (r.error) fail('pass_leads (clear)', r.error);
  r = await db.from('program_athletes').delete().in('partner_id', [a.id, b.id]);
  if (r.error) fail('program_athletes (clear)', r.error);

  // One upsert per row, not one for both: a bulk upsert sends the UNION of
  // the rows' keys, so a key one row omits arrives as an explicit NULL rather
  // than the column default (retention_days NOT NULL refused exactly that).
  for (const row of [
    { partner_id: a.id, ...PROGRAM_A, pilot_starts_on: dayOf(-14), pilot_ends_on: dayOf(28) },
    { partner_id: b.id, is_active: false },
  ]) {
    r = await db.from('athlete_programs').upsert(row, { onConflict: 'partner_id' });
    if (r.error) fail('athlete_programs', r.error);
  }

  r = await db.from('program_athletes').insert(
    ATHLETES.map((x) => ({
      id: x.id, partner_id: a.id, user_id: x.userId, level: x.level, status: 'active', ref_code: x.refCode,
      email_lower: x.email, whatsapp_e164: x.whatsapp, started_on: dayOf(-60), added_by: ID(8),
    }))
  );
  if (r.error) fail('program_athletes', r.error);

  const athleteId = Object.fromEntries(ATHLETES.map((x) => [x.key, x.id]));
  r = await db.from('pass_leads').insert(
    LEADS.map((l, i) => ({
      id: ID(3000 + i),
      created_at: at(l.created),
      slug: partnerOfKey[l.partner].slug,
      partner_id: partnerOfKey[l.partner].id,
      name: l.name,
      email: l.email,
      whatsapp: l.whatsapp,
      pass_code: l.code,
      consent_text: 'Acepto que el gimnasio me contacte sobre mi clase gratis.',
      consent_at: at(l.created),
      src: l.athlete ? 'atleta' : null,
      code: l.athlete ? ATHLETES.find((x) => x.key === l.athlete).refCode : null,
      attended_at: at(l.attended),
      attended_marked_by: l.attended === undefined ? null : ELENA,
      attended_method: l.attended === undefined ? null : 'scan',
      referred_by_athlete_id: l.athlete ? athleteId[l.athlete] : null,
      outcome: l.outcome ?? null,
      outcome_at: at(l.outcomeAt),
      outcome_marked_by: l.outcome ? ELENA : null,
      retained_at: at(l.retained),
      bonus_eligible: l.bonusEligible ?? null,
      bonus_settled_at: at(l.settled),
      bonus_settled_by: l.settled === undefined ? null : OWNER_A,
    }))
  );
  if (r.error) fail('pass_leads', r.error);

  // Read back what was WRITTEN, not the length of the arrays above.
  const count = async (table, col, ids) => {
    const { count: n, error } = await db.from(table).select('*', { count: 'exact', head: true }).in(col, ids);
    if (error) fail(`read-back of ${table}`, error);
    return n;
  };
  return {
    partnerA: a,
    partnerB: b,
    programs: await count('athlete_programs', 'partner_id', [a.id, b.id]),
    athletes: await count('program_athletes', 'partner_id', [a.id, b.id]),
    leads: await count('pass_leads', 'partner_id', [a.id, b.id]),
  };
}

export function describeSeed(s) {
  return (
    `  athlete programs  ${s.programs}  (BullBox (Prueba) active, Otro Gym (Prueba) inactive)\n` +
    `  program athletes  ${s.athletes}  (Ana captain, Beto captain, Caro athlete)\n` +
    `  pass leads        ${s.leads}  (expected ${LEADS.length})\n`
  );
}

// ── Standalone: the programs-only reset ─────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fileEnv = readEnvFile(path.join(ROOT, '.env.av.local'));
  const pick = (k) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : fileEnv[k]);
  const url = pick('SUPABASE_URL') ?? pick('NEXT_PUBLIC_SUPABASE_URL') ?? '';
  if (!isLocalDbUrl(url)) {
    console.error(`av-seed-athletes REFUSED: "${url || 'not set'}" is not a local stack. Local only, ever.`);
    process.exit(1);
  }
  const key = pick('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key) {
    console.error('av-seed-athletes FAILED: SUPABASE_SERVICE_ROLE_KEY is not set (the LOCAL key).');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  try {
    const s = await seedAthletePrograms(db, { withPeople: false });
    console.log(`av-seed-athletes OK against ${url}\n${describeSeed(s)}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
