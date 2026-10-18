import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** T-JOIN1 Part C: the Notification Debug panel is out of Settings; the admin shield is admins-only and never on the public site. */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Settings and header clean-up', () => {
  it('Settings has no Notification Debug panel or diagnostic', () => {
    for (const f of ['app/settings/page.tsx', 'app/settings/useSettings.ts']) {
      const src = read(f);
      expect(src).not.toMatch(/Notification Debug|runNotificationDiagnostic|debugRunning/);
    }
  });

  it('the app header reaches /admin only through the gated AdminQuickAccess (restored 2026-10-18)', () => {
    const src = read('components/home/FilterBar.tsx');
    expect(src).toMatch(/<AdminQuickAccess \/>/);
    expect(src).not.toMatch(/href=["']\/admin/);
  });

  it('the public site header never shows the admin shield', () => {
    for (const f of ['components/site/SiteNav.tsx', 'components/site/NavLinks.tsx', 'components/site/NavActions.tsx']) {
      expect(read(f)).not.toMatch(/AdminQuickAccess|href=["']\/admin|is_app_admin|fetchUserIsAdmin/);
    }
  });
});
