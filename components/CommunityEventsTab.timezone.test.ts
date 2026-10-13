import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = fs.readFileSync(path.join(__dirname, 'CommunityEventsTab.tsx'), 'utf-8');

describe('CommunityEventsTab formatEventDate timezone', () => {
  it('passes timeZone America/Bogota to toLocaleDateString', () => {
    expect(SRC).toMatch(/timeZone:\s*['"]America\/Bogota['"]/);
  });

  it('formats a UTC ISO string as Bogotá wall time regardless of process TZ', () => {
    const d = new Date('2026-06-15T23:00:00Z');
    const formatted = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });
    expect(formatted).toMatch(/Jun 15/);
    expect(formatted).toMatch(/6:00/);
  });

  it('does not shift to the process timezone (UTC or Europe/Madrid)', () => {
    const d = new Date('2026-06-15T04:00:00Z');
    const formatted = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });
    expect(formatted).toMatch(/Jun 14/);
    expect(formatted).toMatch(/11:00/);
  });
});
