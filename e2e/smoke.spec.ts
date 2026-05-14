import { expect, test } from '@playwright/test';

/**
 * Public-page smoke tests. No auth required, no Supabase seed data
 * needed. The only thing they prove is "the deployment isn't
 * fundamentally broken" — but that's exactly the gate we want before
 * merging to main.
 *
 * The auth-required scenarios from the original spec
 *   - New gym owner signs up → onboarding → first client
 *   - Coach records attendance → streak → Celebrate Wins
 *   - Owner archives client → audit log → watchdog
 *   - Owner invites coach → coach sees dashboard
 *   - Member visits /my-coach → sees record
 * live in 'authenticated.spec.ts.disabled' until a staging Supabase
 * with seed credentials is wired up. Rename to .spec.ts to enable.
 */

test.describe('public pages render', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    // The landing has the brand wordmark in the nav; if that doesn't
    // appear the page didn't render.
    await expect(page).toHaveTitle(/Tribe/i);
  });

  test('/auth renders sign-in form', async ({ page }) => {
    await page.goto('/auth');
    // The auth page has email + password inputs at minimum.
    // We check for the email input by type rather than label to
    // tolerate copy changes.
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test('/os/dashboard redirects unauthenticated users', async ({ page }) => {
    // Premium-gated route. Without a session, should bounce to /auth
    // (with returnTo) or to the home page — either is fine; the test
    // is that we don't render the gym dashboard to a stranger.
    await page.goto('/os/dashboard');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toMatch(/os\/dashboard$/);
  });

  test('/my-coach redirects unauthenticated users', async ({ page }) => {
    await page.goto('/my-coach');
    await page.waitForLoadState('networkidle');
    const url = page.url();
    expect(url).not.toMatch(/my-coach$/);
  });
});

test.describe('static assets', () => {
  test('favicon serves successfully', async ({ request }) => {
    const res = await request.get('/favicon.ico');
    expect(res.status()).toBeLessThan(400);
  });
});
