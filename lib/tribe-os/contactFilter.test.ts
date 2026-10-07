import { describe, it, expect } from 'vitest';
import { filterContactToday, type ContactFilterRow } from './contactFilter';

function row(overrides: Partial<ContactFilterRow> & { id: string }): ContactFilterRow {
  return {
    level: 'high',
    score: 50,
    days_since_last_activity: 10,
    last_touch: null,
    ...overrides,
  };
}

describe('filterContactToday', () => {
  it('includes high-level members 7-30 days absent with no touch', () => {
    const members = [row({ id: '1', level: 'high', days_since_last_activity: 7 })];
    expect(filterContactToday(members).map((m) => m.id)).toEqual(['1']);
  });

  it('includes medium-level members', () => {
    const members = [row({ id: '1', level: 'medium', days_since_last_activity: 15 })];
    expect(filterContactToday(members)).toHaveLength(1);
  });

  it('excludes low-level members', () => {
    const members = [row({ id: '1', level: 'low' })];
    expect(filterContactToday(members)).toHaveLength(0);
  });

  it('excludes members with <7 days absent', () => {
    const members = [row({ id: '1', days_since_last_activity: 6 })];
    expect(filterContactToday(members)).toHaveLength(0);
  });

  it('excludes members with >30 days absent', () => {
    const members = [row({ id: '1', days_since_last_activity: 31 })];
    expect(filterContactToday(members)).toHaveLength(0);
  });

  it('excludes members with a recent touch', () => {
    const members = [row({ id: '1', last_touch: { created_at: '2026-10-05' } })];
    expect(filterContactToday(members)).toHaveLength(0);
  });

  it('excludes members with null days_since_last_activity', () => {
    const members = [row({ id: '1', days_since_last_activity: null })];
    expect(filterContactToday(members)).toHaveLength(0);
  });

  it('sorts by score descending', () => {
    const members = [row({ id: 'low', score: 20 }), row({ id: 'high', score: 90 }), row({ id: 'mid', score: 55 })];
    expect(filterContactToday(members).map((m) => m.id)).toEqual(['high', 'mid', 'low']);
  });

  it('handles null scores (treated as 0)', () => {
    const members = [row({ id: 'a', score: null }), row({ id: 'b', score: 10 })];
    expect(filterContactToday(members).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('includes boundary day 7 and day 30', () => {
    const members = [
      row({ id: 'at7', days_since_last_activity: 7 }),
      row({ id: 'at30', days_since_last_activity: 30 }),
    ];
    expect(filterContactToday(members)).toHaveLength(2);
  });
});
