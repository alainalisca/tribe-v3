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
  /\bSET\s+NOT\s+NULL\b/i,
  // GRANT/REVOKE on existing tables is forbidden. On new tables created in the
  // same migration (e.g. REVOKE ALL FROM anon) it's required. The consumer-table
  // modifier check below catches GRANT/REVOKE on consumer tables specifically.
  // GRANT/REVOKE on other existing (non-consumer, non-new) tables is caught by
  // human review — the checker is a tripwire, not a proof.
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

// Patterns that indicate a line MODIFIES a consumer table (not just references it).
// A REFERENCES clause or EXISTS subquery reading from a consumer table is safe
// — but a bare REFERENCES without ON DELETE SET NULL or ON DELETE CASCADE is
// dangerous: it creates a NO ACTION foreign key that blocks deletes in the
// consumer app (e.g. account deletion would fail if a user ran an import).
const CONSUMER_MODIFY_PATTERNS = [
  /\bALTER\s+TABLE\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bCREATE\s+TRIGGER\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bTRUNCATE\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bCREATE\s+POLICY\b/i,
  /\bALTER\s+POLICY\b/i,
  /\bDROP\s+POLICY\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

function lineModifiesConsumerTable(line) {
  for (const table of CONSUMER_TABLES) {
    const pat = new RegExp(`\\b${table}\\b`, 'i');
    if (!pat.test(line)) continue;
    for (const modPat of CONSUMER_MODIFY_PATTERNS) {
      if (modPat.test(line)) return table;
    }
  }
  return null;
}

// A REFERENCES to a consumer table without ON DELETE SET NULL or ON DELETE CASCADE
// creates a NO ACTION foreign key. That blocks deletes in the consumer app — e.g.
// account deletion would fail if a user ran an import and the FK prevents the
// users row from being deleted.
const REFERENCES_CONSUMER_RE = /REFERENCES\s+(?:public\.)?(\w+)\s*\(/i;
const ON_DELETE_SAFE_RE = /ON\s+DELETE\s+(SET\s+NULL|CASCADE)/i;

function checkUnsafeConsumerFK(line) {
  const m = REFERENCES_CONSUMER_RE.exec(line);
  if (!m) return null;
  const table = m[1].toLowerCase();
  if (!CONSUMER_TABLES.has(table)) return null;
  if (ON_DELETE_SAFE_RE.test(line)) return null;
  return table;
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

      const contentLines = content.split('\n');
      for (let i = 0; i < contentLines.length; i++) {
        const line = contentLines[i].trim();
        if (line.startsWith('--')) continue;

        for (const pattern of CLASS_A_FORBIDDEN) {
          if (pattern.test(line)) {
            errors.push(`${file}:${i + 1}: Class A file contains forbidden pattern: ${pattern.source}`);
          }
        }

        const modHit = lineModifiesConsumerTable(line);
        if (modHit) {
          errors.push(`${file}:${i + 1}: Class A file modifies consumer table '${modHit}'`);
        }

        const fkHit = checkUnsafeConsumerFK(line);
        if (fkHit) {
          errors.push(
            `${file}:${i + 1}: REFERENCES consumer table '${fkHit}' without ON DELETE SET NULL or CASCADE. ` +
            `A default NO ACTION FK blocks deletes in the consumer app (e.g. account deletion).`
          );
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
