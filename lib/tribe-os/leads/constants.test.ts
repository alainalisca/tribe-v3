import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_ACTIVITY_KINDS,
  FULL_NAME_MAX,
  INTEREST_MAX,
  LOST_REASON_MIN,
  LOST_REASON_MAX,
  ACTIVITY_BODY_MAX,
  EMAIL_MAX,
  PHONE_REGEX,
} from './constants';

const sql = readFileSync(
  resolve(__dirname, '../../../supabase/migrations/9010_tribe_os_leads.sql'),
  'utf-8',
);

function extractCheckIn(text: string, column: string): string[] {
  const pattern = new RegExp(
    `CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([\\s\\S]+?)\\)\\s*\\)`,
    'i',
  );
  const m = text.match(pattern);
  if (!m) throw new Error(`CHECK IN not found for ${column}`);
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('constants match 9010 migration CHECK constraints', () => {
  it('LEAD_SOURCES matches source CHECK', () => {
    const dbValues = extractCheckIn(sql, 'source');
    expect([...LEAD_SOURCES].sort()).toEqual([...dbValues].sort());
  });

  it('LEAD_STATUSES matches status CHECK', () => {
    const leadsCreate = sql.slice(sql.indexOf('CREATE TABLE'));
    const activitiesCreate = leadsCreate.indexOf('CREATE TABLE', 1);
    const leadsTable = activitiesCreate > 0 ? leadsCreate.slice(0, activitiesCreate) : leadsCreate;
    const dbValues = extractCheckIn(leadsTable, 'status');
    expect([...LEAD_STATUSES].sort()).toEqual([...dbValues].sort());
  });

  it('LEAD_ACTIVITY_KINDS matches kind CHECK', () => {
    const lastCreate = sql.lastIndexOf('CREATE TABLE');
    const activitiesTable = sql.slice(lastCreate);
    const dbValues = extractCheckIn(activitiesTable, 'kind');
    expect([...LEAD_ACTIVITY_KINDS].sort()).toEqual([...dbValues].sort());
  });

  it('FULL_NAME_MAX matches full_name char_length', () => {
    const m = sql.match(/char_length\(full_name\)\s+BETWEEN\s+\d+\s+AND\s+(\d+)/i);
    expect(m).toBeTruthy();
    expect(FULL_NAME_MAX).toBe(Number(m![1]));
  });

  it('INTEREST_MAX matches interest char_length', () => {
    const m = sql.match(/interest[^)]*char_length\(interest\)\s*<=\s*(\d+)/i);
    expect(m).toBeTruthy();
    expect(INTEREST_MAX).toBe(Number(m![1]));
  });

  it('LOST_REASON range matches lost_reason char_length', () => {
    const m = sql.match(/char_length\(lost_reason\)\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/i);
    expect(m).toBeTruthy();
    expect(LOST_REASON_MIN).toBe(Number(m![1]));
    expect(LOST_REASON_MAX).toBe(Number(m![2]));
  });

  it('ACTIVITY_BODY_MAX matches body char_length', () => {
    const activitiesSection = sql.slice(sql.indexOf('tribe_os_lead_activities'));
    const m = activitiesSection.match(/char_length\(body\)\s*<=\s*(\d+)/i);
    expect(m).toBeTruthy();
    expect(ACTIVITY_BODY_MAX).toBe(Number(m![1]));
  });

  it('EMAIL_MAX matches email char_length', () => {
    const m = sql.match(/char_length\(email\)\s*<=\s*(\d+)/i);
    expect(m).toBeTruthy();
    expect(EMAIL_MAX).toBe(Number(m![1]));
  });

  it('PHONE_REGEX matches phone CHECK regex', () => {
    const m = sql.match(/phone\s+~\s+'([^']+)'/);
    expect(m).toBeTruthy();
    expect(PHONE_REGEX.source).toBe(m![1]);
  });
});
