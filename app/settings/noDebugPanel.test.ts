import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** T-JOIN1 Part C: the Notification Debug panel is out of Settings, and no admin link sits in the public header. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Settings and header clean-up', () => {
  it('Settings has no Notification Debug panel or diagnostic', () => {
    for (const f of ['app/settings/page.tsx', 'app/settings/useSettings.ts']) {
      const src = read(f);
      expect(src).not.toMatch(/Notification Debug|runNotificationDiagnostic|debugRunning/);
    }
  });

  it('the home header carries no /admin shortcut', () => {
    const src = read('components/home/FilterBar.tsx');
    expect(src).not.toMatch(/AdminQuickAccess|href=["']\/admin/);
  });
});
