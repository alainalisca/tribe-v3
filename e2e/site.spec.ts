import { expect, test } from '@playwright/test';

/**
 * T-SITE1.1 Part E. Every site page in both languages at a phone and a laptop
 * width: no console errors, no horizontal scroll, and its length in screens
 * (Inicio 7 or fewer on a phone). The screen counts are printed for the report.
 *
 * Run against a production build: PLAYWRIGHT_BASE_URL=http://localhost:3006
 * npx playwright test e2e/site.spec.ts
 */
const PAGES = ['/', '/para-atletas/', '/deportes/', '/coaches/', '/gimnasios/', '/tribe-os/', '/tv/', '/preguntas/'];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1366, height: 800 },
];
const INICIO_MAX_SCREENS = 7;

for (const lang of ['es', 'en'] as const) {
  for (const vp of VIEWPORTS) {
    for (const path of PAGES) {
      test(`${lang} ${path} at ${vp.width}`, async ({ page, context, baseURL }) => {
        await context.addCookies([{ name: 'tribe_lang', value: lang, url: baseURL ?? 'http://localhost:3006' }]);
        await page.setViewportSize(vp);
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(path, { waitUntil: 'load' });
        await expect(page.locator('html')).toHaveAttribute('lang', lang);

        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          height: document.documentElement.scrollHeight,
        }));
        const screens = Math.round((m.height / vp.height) * 10) / 10;
        console.log(`SCREENS ${lang} ${vp.width} ${path} ${screens}`);

        expect(m.scrollWidth, 'horizontal scroll').toBeLessThanOrEqual(m.clientWidth);
        // The 7-screen rule (T-SITE1, decision 7) is a phone rule; desktop is printed for the report.
        if (path === '/' && vp.width < 600) expect(screens).toBeLessThanOrEqual(INICIO_MAX_SCREENS);
        expect(errors).toEqual([]);
      });
    }
  }
}
