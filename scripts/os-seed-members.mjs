#!/usr/bin/env node
/**
 * T-OS0 Step 4: Generate a SQL file that seeds 150 fake members into
 * the bullbox-prueba test gym. Al runs the output in the SQL editor.
 *
 * Usage:
 *   node scripts/os-seed-members.mjs
 *
 * Output:
 *   scripts/generated/os-seed-members.sql
 *
 * Safety:
 *   - Does NOT connect to the database. Generates SQL only.
 *   - All rows are tagged '{seed}'.
 *   - Never touches the 4 existing clients in the gym.
 *   - Never writes client_attendance.
 *   - Emails use @example.com (RFC 2606 reserved domain).
 *   - Phones use +573000000xx (fake Colombian mobiles).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GYM_ID = 'd585af30-5ed5-448b-bd9c-ab82b2e99970';
const INSTRUCTOR_ID = 'eaff348f-5df3-4df5-bd80-69ec233aad0e';
const COUNT = 150;

const FIRST_NAMES = [
  'Carlos', 'María', 'Andrés', 'Laura', 'Diego', 'Valentina',
  'Santiago', 'Camila', 'Julián', 'Daniela', 'Felipe', 'Isabella',
  'Mateo', 'Sofía', 'Sebastián', 'Natalia', 'David', 'Gabriela',
  'Nicolás', 'Paula', 'Alejandro', 'Mariana', 'Tomás', 'Luciana',
  'Samuel', 'Catalina', 'Emilio', 'Valeria', 'Martín', 'Sara',
  'José', 'Andrea', 'Daniel', 'Carolina', 'Luis', 'Ana',
  'Miguel', 'Paola', 'Javier', 'Claudia', 'Ricardo', 'Lorena',
  'Jorge', 'Diana', 'Esteban', 'Marcela', 'Fernando', 'Viviana',
  'Iván', 'Tatiana',
];

const LAST_NAMES = [
  'García', 'Rodríguez', 'Martínez', 'López', 'González',
  'Hernández', 'Díaz', 'Moreno', 'Muñoz', 'Álvarez',
  'Ramírez', 'Torres', 'Sánchez', 'Castillo', 'Vargas',
  'Rojas', 'Herrera', 'Medina', 'Gutiérrez', 'Reyes',
  'Ruiz', 'Ortiz', 'Salazar', 'Cruz', 'Peña',
  'Ríos', 'Cardona', 'Ospina', 'Mejía', 'Valencia',
];

const STATUSES = ['active', 'active', 'active', 'active', 'active',
  'active', 'inactive', 'inactive', 'lapsed', 'lead'];

function esc(s) {
  return s.replace(/'/g, "''");
}

const lines = [];
lines.push(`-- T-OS0: Seed 150 fake members into bullbox-prueba`);
lines.push(`-- Run manually in Supabase SQL editor. Do NOT run from code.`);
lines.push(`-- All rows tagged 'seed'. The 4 existing clients are untouched.`);
lines.push(`-- Never writes client_attendance.`);
lines.push(``);
lines.push(`INSERT INTO clients (`);
lines.push(`  gym_id, instructor_user_id, name, email, phone, status, tags, created_at`);
lines.push(`) VALUES`);

const values = [];
const now = Date.now();
for (let i = 0; i < COUNT; i++) {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const last = LAST_NAMES[i % LAST_NAMES.length];
  const suffix = i < FIRST_NAMES.length ? '' : String(Math.floor(i / FIRST_NAMES.length));
  const name = `${first} ${last}`;
  const email = `seed.${first.toLowerCase()}.${last.toLowerCase().replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'})[c])}${suffix}@example.com`;
  const phone = `+5730000${String(i).padStart(4, '0')}`;
  const status = STATUSES[i % STATUSES.length];
  const daysAgo = 180 - Math.floor(i * 1.2);
  const createdAt = new Date(now - Math.max(daysAgo, 1) * 86400000).toISOString();

  values.push(
    `  ('${GYM_ID}', '${INSTRUCTOR_ID}', '${esc(name)}', '${esc(email)}', '${phone}', '${status}', '{seed}', '${createdAt}')`
  );
}

lines.push(values.join(',\n'));
lines.push(`ON CONFLICT DO NOTHING;`);
lines.push(``);

const outDir = join(import.meta.dirname, 'generated');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'os-seed-members.sql');
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`✅ Generated ${outPath}`);
console.log(`   ${COUNT} members, all tagged 'seed', emails @example.com`);
console.log(`   Run this SQL in the Supabase SQL editor.`);
