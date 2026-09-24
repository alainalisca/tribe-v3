#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

const CONSUMER_TABLES = new Set([
  'users', 'sessions', 'session_participants', 'session_attendance',
  'featured_partners', 'partner_instructors', 'payments',
  'notifications', 'chat_messages', 'chat_rooms', 'chat_participants',
  'push_subscriptions', 'session_stories', 'session_recap_photos',
  'session_templates', 'session_reminders', 'reviews',
]);

const CLASS_A_FORBIDDEN = [
  /\bDROP\s+(TABLE|COLUMN|INDEX|CONSTRAINT|VIEW|FUNCTION|SCHEMA)\b/i,
  /\bRENAME\b/i,
  /\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i,
  /\bCREATE\s+TRIGGER\b/i,
  /\bALTER\s+POLICY\b/i,
  /\bDROP\s+POLICY\b/i,
  /\b(GRANT|REVOKE)\b/i,
  /\bSET\s+NOT\s+NULL\b/i,
];

function extractNumber(filename) {
  const m = filename.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function isClassAHeader(content) {
  const headerMatch = content.match(/--\s*CLASS:\s*(\w+)/i);
  if (!headerMatch) return null;
  return headerMatch[1].toUpperCase() === 'A';
}

function touchesConsumerTable(content) {
  const touched = [];
  for (const table of CONSUMER_TABLES) {
    const pat = new RegExp(`\\b${table}\\b`, 'i');
    if (pat.test(content)) touched.push(table);
  }
  return touched;
}

export async function checkMigrations() {
  const errors = [];
  let classACount = 0;
  let heldCount = 0;

  let files;
  try {
    files = await readdir(MIGRATIONS_DIR);
  } catch {
    return { errors: [], classACount: 0, heldCount: 0 };
  }

  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .filter(f => {
      const num = extractNumber(f);
      return num !== null && num >= 9000;
    })
    .sort();

  for (const file of migrationFiles) {
    const content = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    const isHeld = file.endsWith('.held.sql');
    const classA = isClassAHeader(content);

    if (classA === null) {
      errors.push(`${file}: missing CLASS header (-- CLASS: A or -- CLASS: B (HELD))`);
      continue;
    }

    if (classA) {
      classACount++;

      if (isHeld) {
        errors.push(`${file}: marked CLASS: A but filename ends in .held.sql`);
      }

      for (const pattern of CLASS_A_FORBIDDEN) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('--')) continue;
          if (pattern.test(line)) {
            errors.push(`${file}:${i + 1}: Class A file contains forbidden pattern: ${pattern.source}`);
          }
        }
      }

      const consumerHits = touchesConsumerTable(content);
      for (const table of consumerHits) {
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('--')) continue;
          const pat = new RegExp(`\\b${table}\\b`, 'i');
          if (pat.test(line)) {
            errors.push(`${file}:${i + 1}: Class A file references consumer table '${table}'`);
            break;
          }
        }
      }
    } else {
      heldCount++;
      if (!isHeld) {
        errors.push(`${file}: marked CLASS: B but filename does not end in .held.sql`);
      }
    }
  }

  return { errors, classACount, heldCount };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const { errors, classACount, heldCount } = await checkMigrations();
  if (errors.length) {
    console.error('❌ os-migration-check FAILED:');
    for (const e of errors) console.error(`   ${e}`);
    process.exit(1);
  }
  console.log(`✅ os-migration-check OK: ${classACount} Class A, ${heldCount} held`);
}
