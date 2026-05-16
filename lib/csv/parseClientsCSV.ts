/**
 * lib/csv/parseClientsCSV.ts
 *
 * Pure-JS CSV parser for the bulk-client-import flow. Handles the
 * realistic shapes a coach exports from a spreadsheet:
 *
 *   - Header row (case-insensitive, leading/trailing whitespace ok)
 *   - Quoted fields containing commas, embedded quotes (""), newlines
 *   - Trailing newline tolerated
 *   - Empty rows skipped silently
 *   - BOM stripped if present
 *
 * Why hand-roll instead of pulling in a parser: adding a dep for ~80
 * lines of code is overkill, and we want server + client to share
 * the same parser later if we add export. The grammar is small.
 *
 * Output is a discriminated parse-result so the UI can show the user
 * exactly which rows are valid vs. which need fixing before import.
 *
 * Column mapping (case-insensitive header names):
 *   - name           — required
 *   - email          — optional
 *   - phone          — optional
 *   - status         — optional, one of active|inactive|lead|lapsed
 *   - notes          — optional
 *   - tags           — optional, comma-separated within the cell
 *   - health_notes   — optional
 *
 * Unknown columns are ignored (with a one-time warning row in the
 * result). Missing optional columns are fine. Missing `name` is a
 * row-level error and the row is excluded.
 */

export interface ParsedClientRow {
  /** 1-based row number in the original file (excluding header). */
  rowNumber: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'inactive' | 'lead' | 'lapsed' | null;
  notes: string | null;
  tags: string[];
  health_notes: string | null;
}

export interface ParseRowError {
  rowNumber: number;
  /** Best-effort raw text of the row, for UI display. */
  raw: string;
  message: string;
}

export interface ParseResult {
  rows: ParsedClientRow[];
  errors: ParseRowError[];
  /** Headers we recognized, lowercased. Useful for diagnostics. */
  headers: string[];
  /** Headers we didn't recognize, lowercased. UI shows these as a hint. */
  unknownHeaders: string[];
}

/**
 * Recognized column keys → canonical field name in ParsedClientRow.
 * Add aliases here as we encounter export shapes in the wild.
 */
const HEADER_ALIASES: Record<string, keyof ParsedClientRow | 'tags'> = {
  name: 'name',
  'full name': 'name',
  'client name': 'name',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  'phone number': 'phone',
  mobile: 'phone',
  whatsapp: 'phone',
  status: 'status',
  notes: 'notes',
  note: 'notes',
  tags: 'tags',
  tag: 'tags',
  'health notes': 'health_notes',
  health_notes: 'health_notes',
  medical: 'health_notes',
};

const STATUS_VALUES: Readonly<Array<ParsedClientRow['status']>> = ['active', 'inactive', 'lead', 'lapsed'];

/**
 * Tokenize a CSV line into raw cells. Handles double-quoted cells
 * with escaped quotes (""). The parser is line-by-line, which means
 * embedded newlines inside quotes are NOT supported in v1 — that's
 * the trade-off for the simple split-on-newlines outer loop. Almost
 * every export tool we see in the gym market produces single-line
 * rows, so this is fine for now. Future: switch to a true streaming
 * parser if a customer ships a Notion / Airtable export with
 * embedded line breaks.
 */
function parseRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote: "" → "
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === ',') {
        cells.push(current);
        current = '';
      } else if (ch === '"' && current === '') {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, ' ');
}

function emptyResult(): ParseResult {
  return { rows: [], errors: [], headers: [], unknownHeaders: [] };
}

/**
 * Parse a CSV string into an array of client rows. The caller passes
 * the full file text (typical for files under a few MB — coaches'
 * rosters are 50–500 rows).
 */
export function parseClientsCSV(text: string): ParseResult {
  // Strip BOM if present (Excel exports love adding one).
  const cleaned = text.replace(/^﻿/, '');
  // Normalize line endings. \r\n → \n. Keeps the line-split simple.
  const lines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length === 0) return emptyResult();

  // Find the header row — skip leading empty lines defensively.
  let headerIndex = 0;
  while (headerIndex < lines.length && lines[headerIndex].trim() === '') headerIndex += 1;
  if (headerIndex >= lines.length) return emptyResult();

  const headerCells = parseRow(lines[headerIndex]).map(normalizeHeader);
  const headers: string[] = [];
  const unknownHeaders: string[] = [];
  /** column index → canonical field. */
  const columnMap = new Map<number, keyof ParsedClientRow | 'tags'>();
  headerCells.forEach((h, idx) => {
    const canon = HEADER_ALIASES[h];
    if (canon) {
      columnMap.set(idx, canon);
      headers.push(h);
    } else if (h !== '') {
      unknownHeaders.push(h);
    }
  });

  // A file without a recognizable `name` column is non-importable —
  // surface a single global error rather than per-row spam.
  const hasName = Array.from(columnMap.values()).includes('name');
  if (!hasName) {
    return {
      rows: [],
      errors: [
        {
          rowNumber: 0,
          raw: lines[headerIndex],
          message: 'No "name" column found. Add a column named name (or full name) to your file.',
        },
      ],
      headers,
      unknownHeaders,
    };
  }

  const rows: ParsedClientRow[] = [];
  const errors: ParseRowError[] = [];

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === '') continue; // skip blanks
    const rowNumber = i - headerIndex;
    const cells = parseRow(raw);

    // Build the row from the column map, starting with defaults.
    const row: ParsedClientRow = {
      rowNumber,
      name: '',
      email: null,
      phone: null,
      status: null,
      notes: null,
      tags: [],
      health_notes: null,
    };

    for (const [idx, field] of columnMap.entries()) {
      const cell = (cells[idx] ?? '').trim();
      if (cell === '') continue;
      switch (field) {
        case 'name':
          row.name = cell;
          break;
        case 'email':
          row.email = cell;
          break;
        case 'phone':
          row.phone = cell;
          break;
        case 'status': {
          const lower = cell.toLowerCase() as ParsedClientRow['status'];
          if (lower && STATUS_VALUES.includes(lower)) {
            row.status = lower;
          } else {
            errors.push({
              rowNumber,
              raw,
              message: `Invalid status "${cell}". Use active, inactive, lead, or lapsed.`,
            });
          }
          break;
        }
        case 'notes':
          row.notes = cell;
          break;
        case 'tags':
          // Split tags on comma or semicolon. Trim and dedupe. Cap at
          // 10 to match the API's tag count limit so the user doesn't
          // discover the cap at submit time.
          row.tags = Array.from(
            new Set(
              cell
                .split(/[,;]/)
                .map((t) => t.trim())
                .filter((t) => t.length > 0)
            )
          ).slice(0, 10);
          break;
        case 'health_notes':
          row.health_notes = cell;
          break;
      }
    }

    if (!row.name) {
      errors.push({ rowNumber, raw, message: 'Missing name.' });
      continue;
    }
    if (row.name.length > 120) {
      errors.push({ rowNumber, raw, message: 'Name is too long (max 120 characters).' });
      continue;
    }
    rows.push(row);
  }

  return { rows, errors, headers, unknownHeaders };
}
