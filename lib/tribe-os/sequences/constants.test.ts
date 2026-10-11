import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ENROLLMENT_STATUSES,
  ENROLLED_BY_TYPES,
  STEP_CHANNELS,
  AUTONOMY_MODES,
  STEP_POSITION_MIN,
  STEP_POSITION_MAX,
  DAY_OFFSET_MIN,
  DAY_OFFSET_MAX,
  SEQUENCE_NAME_MAX,
} from './constants';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/9009_tribe_os_sequences.sql'),
  'utf-8',
);

function extractCheckIn(text: string, column: string): string[] {
  const pattern = new RegExp(
    `${column}[^)]*CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]+)\\)`,
    'i',
  );
  const m = text.match(pattern);
  if (!m) throw new Error(`CHECK IN not found for ${column}`);
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''));
}

function extractBetween(text: string, column: string): [number, number] {
  const pattern = new RegExp(
    `${column}\\s+BETWEEN\\s+(\\d+)\\s+AND\\s+(\\d+)`,
    'i',
  );
  const m = text.match(pattern);
  if (!m) throw new Error(`BETWEEN not found for ${column}`);
  return [Number(m[1]), Number(m[2])];
}

describe('constants match 9009 migration CHECK constraints', () => {
  it('ENROLLMENT_STATUSES', () => {
    const dbValues = extractCheckIn(sql, 'status');
    expect([...ENROLLMENT_STATUSES].sort()).toEqual([...dbValues].sort());
  });

  it('ENROLLED_BY_TYPES', () => {
    const dbValues = extractCheckIn(sql, 'enrolled_by_type');
    expect([...ENROLLED_BY_TYPES].sort()).toEqual([...dbValues].sort());
  });

  it('STEP_CHANNELS (sequence_steps)', () => {
    const stepsTable = sql.slice(sql.indexOf('tribe_os_sequence_steps'));
    const dbValues = extractCheckIn(stepsTable, 'channel');
    expect([...STEP_CHANNELS].sort()).toEqual([...dbValues].sort());
  });

  it('AUTONOMY_MODES', () => {
    const dbValues = extractCheckIn(sql, 'sequence_autonomy');
    expect([...AUTONOMY_MODES].sort()).toEqual([...dbValues].sort());
  });

  it('step position range', () => {
    const [min, max] = extractBetween(sql, 'position');
    expect(STEP_POSITION_MIN).toBe(min);
    expect(STEP_POSITION_MAX).toBe(max);
  });

  it('day_offset range', () => {
    const [min, max] = extractBetween(sql, 'day_offset');
    expect(DAY_OFFSET_MIN).toBe(min);
    expect(DAY_OFFSET_MAX).toBe(max);
  });

  it('sequence name max length', () => {
    const m = sql.match(/char_length\(name\)\s+BETWEEN\s+\d+\s+AND\s+(\d+)/i);
    expect(m).toBeTruthy();
    expect(SEQUENCE_NAME_MAX).toBe(Number(m![1]));
  });
});
