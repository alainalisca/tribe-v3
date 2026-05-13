/**
 * lib/csv/serialize.ts
 *
 * Shared helpers for CSV export endpoints. The revenue export had
 * its own private csvEscape; now that we're adding members +
 * attendance exports, the escape logic + the response builder live
 * here so all three export endpoints stay byte-identical on
 * formatting.
 *
 * Why hand-rolled (again): the export hot path produces small to
 * mid-size CSVs (≤ 5000 rows). Pulling in a streaming CSV library
 * would add weight without a perf win. The RFC-4180 escape rules
 * are small: quote any cell containing a quote, comma, or newline;
 * double any embedded quote. That's it.
 *
 * UTF-8 BOM is prepended to every export response so Excel opens
 * non-ASCII names (acentos, ñ, emoji) correctly without the user
 * having to pick "Encoding: UTF-8" from the import wizard.
 */

import { NextResponse } from 'next/server';

const UTF8_BOM = '﻿';

/**
 * Escape a single cell for RFC-4180-style CSV. Cells with no
 * special characters pass through verbatim — keeps the file small
 * and human-readable in plain-text viewers.
 */
export function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize a 2D array (header + body rows) into a CSV string.
 * Joins rows with \r\n (Excel-friendly) and escapes every cell.
 * Returns the assembled body WITHOUT the leading BOM — that's added
 * by buildCsvResponse so callers can also use this helper for
 * in-memory CSVs (preview, tests).
 */
export function rowsToCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

/**
 * Build a Next.js Response for a CSV download. Sets the correct
 * Content-Type + filename, prepends the UTF-8 BOM, and adds a
 * cache-control header that prevents stale exports from sitting in
 * intermediate caches.
 */
export function buildCsvResponse(body: string, filename: string): NextResponse {
  return new NextResponse(UTF8_BOM + body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Stable file-name builder: prefix + YYYY-MM-DD timestamp + .csv.
 * Keeps every export named consistently so the user's downloads
 * folder stays scannable.
 */
export function buildExportFilename(prefix: string, today: Date = new Date()): string {
  const iso = today.toISOString().slice(0, 10);
  return `${prefix}-${iso}.csv`;
}
