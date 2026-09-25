#!/usr/bin/env node
/**
 * Generates two SQL files for T-OS1 seed data:
 *   scripts/generated/os-seed-members.sql  — 150 fake members
 *   scripts/generated/os-seed-visits.sql   — 6 months of client_visits
 *
 * Deterministic (seed=42). Safe to re-run: ON CONFLICT DO NOTHING.
 * Does NOT connect to the database.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, 'generated');
mkdirSync(OUT, { recursive: true });

const GYM = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';
const INSTRUCTOR = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';
const TODAY = new Date('2026-09-24T00:00:00');
const VISIT_START = new Date('2026-03-24T00:00:00');

// --- Seeded PRNG (mulberry32) ---
let _s = 42;
function rand() {
  let t = (_s += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function pick(a) { return a[Math.floor(rand() * a.length)]; }
function randInt(lo, hi) { return Math.floor(rand() * (hi - lo + 1)) + lo; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dfmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function q(s) { return s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`; }

// --- Name pools ---
const FN_M = [
  'Santiago','Mateo','Sebastián','Nicolás','Samuel','Alejandro','Daniel',
  'Andrés','Felipe','Juan','Carlos','Diego','David','Miguel','Tomás',
  'Gabriel','Camilo','Esteban','Julián','Cristian','Óscar','Ricardo',
  'Fernando','Jhon','Javier',
];
const FN_F = [
  'Valentina','Sofía','Isabella','Mariana','Luciana','Gabriela','Daniela',
  'Camila','Sara','Laura','María','Natalia','Andrea','Carolina','Paola',
  'Juliana','Diana','Alejandra','Catalina','Paula','Verónica','Adriana',
  'Tatiana','Sandra','Claudia',
];
const LN = [
  'García','Rodríguez','Martínez','López','González','Hernández','Díaz',
  'Morales','Restrepo','Sánchez','Ramírez','Torres','Flores','Rivera',
  'Gómez','Muñoz','Vargas','Jiménez','Castillo','Ospina','Salazar',
  'Mejía','Arias','Duarte','Correa','Valencia','Suárez','Montoya',
  'Castaño','Arango',
];
const TIMES = ['06:00','07:00','12:00','18:00','19:00'];
const COACH_MAP = {
  CrossFit: ['Coach Leo','Coach Pipe'],
  HYROX: ['Coach Mafe','Coach Dani'],
  'Open Box': ['Coach Andrés', null],
};

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function pickPlan() {
  const r = rand();
  return r < 0.4 ? 'Ilimitado' : r < 0.75 ? '3x semana' : '2x semana';
}
function patternOf(i) {
  if (i < 30) return 'steady_regular';
  if (i < 60) return 'slow_fader';
  if (i < 85) return 'sudden_stop';
  if (i < 115) return 'new_member';
  return 'sparse_irregular';
}
function prefDays(idx, count) {
  const pool = [1, 2, 3, 4, 5, 6];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = ((idx + 1) * 31 + i * 17) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, count));
}

// ==================== MEMBERS ====================
const members = [];
for (let i = 0; i < 150; i++) {
  const fem = rand() > 0.45;
  const first = pick(fem ? FN_F : FN_M);
  const l1 = pick(LN);
  let l2 = pick(LN);
  while (l2 === l1) l2 = pick(LN);
  const name = `${first} ${l1} ${l2}`;
  const email = `${slug(first)}.${slug(l1)}.${String(i).padStart(3, '0')}@example.com`;
  const phone = `+573${randInt(0, 3)}${randInt(0, 9)}${String(randInt(1000000, 9999999))}`;
  const extId = `MIRA-${String(i + 1).padStart(4, '0')}`;
  const plan = pickPlan();
  const pat = patternOf(i);

  let joinedOn, planEndsOn, stopDate = null;
  switch (pat) {
    case 'steady_regular':
      joinedOn = addDays(TODAY, -randInt(180, 540));
      planEndsOn = i < 5 ? addDays(TODAY, randInt(1, 7)) : addDays(TODAY, randInt(30, 180));
      break;
    case 'slow_fader':
      joinedOn = addDays(TODAY, -randInt(90, 365));
      planEndsOn = i < 35 ? addDays(TODAY, randInt(1, 7)) : addDays(TODAY, randInt(14, 90));
      break;
    case 'sudden_stop':
      joinedOn = addDays(TODAY, -randInt(120, 450));
      stopDate = addDays(TODAY, -randInt(15, 45));
      planEndsOn = i < 65 ? addDays(TODAY, randInt(-7, 7)) : addDays(TODAY, randInt(14, 60));
      break;
    case 'new_member':
      joinedOn = addDays(TODAY, -randInt(1, 30));
      planEndsOn = addDays(TODAY, randInt(30, 120));
      break;
    case 'sparse_irregular':
      joinedOn = addDays(TODAY, -randInt(60, 540));
      planEndsOn = addDays(TODAY, randInt(-30, 90));
      break;
  }

  let nDays, prob;
  switch (pat) {
    case 'steady_regular':   nDays = randInt(3, 5); prob = 0.90; break;
    case 'slow_fader':       nDays = randInt(3, 4); prob = 0.85; break;
    case 'sudden_stop':      nDays = randInt(3, 4); prob = 0.85; break;
    case 'new_member':       nDays = randInt(2, 4); prob = 0.80; break;
    case 'sparse_irregular': nDays = randInt(1, 2); prob = 0.40; break;
  }

  members.push({
    i, name, email, phone, extId, plan, pat,
    joinedOn, planEndsOn, stopDate,
    pDays: prefDays(i, nDays),
    pTime: TIMES[i % TIMES.length],
    prob,
  });
}

// --- Write members SQL ---
let msql = `-- T-OS1 Seed: 150 fake members for test gym
-- Generated by scripts/os-generate-seed-data.mjs (seed=42, deterministic)
-- Safe to re-run: ON CONFLICT DO NOTHING
--
-- GYM:        ${GYM}
-- INSTRUCTOR: ${INSTRUCTOR}
-- Emails: @example.com  |  Phones: fake +57  |  Tags: {seed}
--
-- Pattern mapping (by external_id):
--   MIRA-0001..MIRA-0030  steady_regular   (30)
--   MIRA-0031..MIRA-0060  slow_fader       (30)
--   MIRA-0061..MIRA-0085  sudden_stop      (25)
--   MIRA-0086..MIRA-0115  new_member       (30)
--   MIRA-0116..MIRA-0150  sparse_irregular (35)

BEGIN;

`;
for (const m of members) {
  msql += `INSERT INTO public.clients (gym_id, instructor_user_id, name, email, phone, tags, external_source, external_id, joined_on, membership_plan, plan_ends_on)
VALUES ('${GYM}', '${INSTRUCTOR}', ${q(m.name)}, ${q(m.email)}, ${q(m.phone)}, '{seed}', 'mira_csv', '${m.extId}', '${dfmt(m.joinedOn)}', ${q(m.plan)}, '${dfmt(m.planEndsOn)}')
ON CONFLICT (gym_id, external_source, external_id) WHERE external_id IS NOT NULL DO NOTHING;
`;
}

msql += `
COMMIT;

SELECT
  count(*) FILTER (WHERE tags @> '{seed}') AS seed_members_total,
  count(*) FILTER (WHERE tags @> '{seed}' AND joined_on >= '2026-08-25') AS joined_last_30d,
  count(*) FILTER (WHERE tags @> '{seed}' AND plan_ends_on BETWEEN '2026-09-24' AND '2026-10-01') AS plan_expiring_7d
FROM public.clients
WHERE gym_id = '${GYM}';
`;
writeFileSync(join(OUT, 'os-seed-members.sql'), msql);

// ==================== VISITS ====================
const visits = [];
let vn = 0;

for (let d = new Date(VISIT_START); d < TODAY; d.setDate(d.getDate() + 1)) {
  const dow = d.getDay();
  if (dow === 0) continue;

  for (const m of members) {
    const day = new Date(d);
    if (m.pat === 'new_member' && day < m.joinedOn) continue;
    if (m.pat === 'sudden_stop' && m.stopDate && day >= m.stopDate) continue;
    if (!m.pDays.has(dow)) continue;

    let p = m.prob;
    if (m.pat === 'slow_fader') {
      const wk = Math.floor((TODAY - day) / (7 * 864e5));
      if (wk < 2) p = 0;
      else if (wk < 4) p = 0.10;
      else if (wk < 6) p = 0.30;
      else if (wk < 8) p = 0.50;
    }
    if (rand() > p) continue;

    const cls = dow === 6 ? 'Open Box' : pick(['CrossFit','CrossFit','CrossFit','HYROX','HYROX']);
    visits.push({
      mExt: m.extId,
      at: `${dfmt(day)} ${m.pTime}:00-05`,
      cls,
      coach: pick(COACH_MAP[cls]),
      ext: `MIRA-V-${String(++vn).padStart(5, '0')}`,
    });
  }
}

let vsql = `-- T-OS1 Seed: ${visits.length} visits for 150 seed members
-- Generated by scripts/os-generate-seed-data.mjs (seed=42, deterministic)
-- Safe to re-run: ON CONFLICT DO NOTHING
--
-- GYM: ${GYM}  |  Source: mira_csv
-- Classes: CrossFit, HYROX, Open Box
-- Times: 06:00, 07:00, 12:00, 18:00, 19:00 (Colombia UTC-5)
--
-- Behavior patterns (labeled for retention-model validation):
--   steady_regular   (MIRA-0001..0030): 3-5x/week, consistent 6 months
--   slow_fader       (MIRA-0031..0060): frequency drops over last 8 weeks
--   sudden_stop      (MIRA-0061..0085): regular then nothing for 15+ days
--   new_member       (MIRA-0086..0115): joined last 30 days, 2-4x/week
--   sparse_irregular (MIRA-0116..0150): 0-2x/week with multi-week gaps

BEGIN;

`;

const BATCH = 500;
for (let b = 0; b < visits.length; b += BATCH) {
  const chunk = visits.slice(b, b + BATCH);
  vsql += `INSERT INTO public.client_visits (gym_id, client_id, visited_at, class_name, coach_name, source, external_id)\nSELECT\n  '${GYM}'::uuid, c.id, v.visited_at, v.class_name, v.coach_name, 'mira_csv', v.ext_id\nFROM (VALUES\n`;
  for (let j = 0; j < chunk.length; j++) {
    const v = chunk[j];
    const comma = j < chunk.length - 1 ? ',' : '';
    if (j === 0) {
      vsql += `  (${q(v.mExt)}::text, ${q(v.at)}::timestamptz, ${q(v.cls)}::text, ${v.coach === null ? 'NULL::text' : q(v.coach)}, ${q(v.ext)}::text)${comma}\n`;
    } else {
      vsql += `  (${q(v.mExt)}, ${q(v.at)}, ${q(v.cls)}, ${v.coach === null ? 'NULL' : q(v.coach)}, ${q(v.ext)})${comma}\n`;
    }
  }
  vsql += `) AS v(member_ext, visited_at, class_name, coach_name, ext_id)\nJOIN public.clients c ON c.gym_id = '${GYM}'::uuid\n  AND c.external_source = 'mira_csv'\n  AND c.external_id = v.member_ext\nON CONFLICT (gym_id, client_id, visited_at) DO NOTHING;\n\n`;
}

vsql += `COMMIT;

SELECT
  count(*) AS total_visits,
  count(DISTINCT cv.client_id) AS members_with_visits,
  count(*) FILTER (WHERE c.external_id BETWEEN 'MIRA-0001' AND 'MIRA-0030') AS visits_steady_regular,
  count(DISTINCT cv.client_id) FILTER (WHERE c.external_id BETWEEN 'MIRA-0001' AND 'MIRA-0030') AS members_steady_regular,
  count(*) FILTER (WHERE c.external_id BETWEEN 'MIRA-0031' AND 'MIRA-0060') AS visits_slow_fader,
  count(DISTINCT cv.client_id) FILTER (WHERE c.external_id BETWEEN 'MIRA-0031' AND 'MIRA-0060') AS members_slow_fader,
  count(*) FILTER (WHERE c.external_id BETWEEN 'MIRA-0061' AND 'MIRA-0085') AS visits_sudden_stop,
  count(DISTINCT cv.client_id) FILTER (WHERE c.external_id BETWEEN 'MIRA-0061' AND 'MIRA-0085') AS members_sudden_stop,
  count(*) FILTER (WHERE c.external_id BETWEEN 'MIRA-0086' AND 'MIRA-0115') AS visits_new_member,
  count(DISTINCT cv.client_id) FILTER (WHERE c.external_id BETWEEN 'MIRA-0086' AND 'MIRA-0115') AS members_new_member,
  count(*) FILTER (WHERE c.external_id BETWEEN 'MIRA-0116' AND 'MIRA-0150') AS visits_sparse_irregular,
  count(DISTINCT cv.client_id) FILTER (WHERE c.external_id BETWEEN 'MIRA-0116' AND 'MIRA-0150') AS members_sparse_irregular
FROM public.client_visits cv
JOIN public.clients c ON c.id = cv.client_id
WHERE cv.gym_id = '${GYM}' AND cv.source = 'mira_csv';
`;
writeFileSync(join(OUT, 'os-seed-visits.sql'), vsql);

const mKB = (Buffer.byteLength(msql) / 1024).toFixed(1);
const vKB = (Buffer.byteLength(vsql) / 1024).toFixed(1);
console.log(`✅ os-seed-members.sql: ${members.length} members, ${mKB} KB`);
console.log(`✅ os-seed-visits.sql:  ${visits.length} visits, ${vKB} KB`);
