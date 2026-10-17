import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * T-SITE1.1 Part A. Faces at every viewport.
 *
 * Every people photo carries data-face-anchor="x y": where its faces are, in
 * percent of the image (lib/site/photos.ts FACE_ANCHORS). For each one this
 * works out where that point lands on screen from the image's natural size,
 * its computed object-fit and object-position, and its box clipped by every
 * ancestor that hides overflow, and fails if the point is not painted.
 *
 * Inicio covers the hero, the doors, the roster, the essay and the closing;
 * Gimnasios covers the page hero and the partner photos.
 *
 * Run against a production build: PLAYWRIGHT_BASE_URL=http://localhost:3006
 * npx playwright test e2e/faces.spec.ts
 */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1366, height: 800 },
  { width: 1920, height: 900 },
  { width: 2560, height: 1000 },
];
const PAGES = ['/', '/gimnasios/'];

type Miss = { src: string; anchor: string; point: [number, number]; box: [number, number, number, number] };

/**
 * Where the anchor of one photo lands, or null when it is painted. Measured
 * with the photo scrolled into view, so a card in a horizontal scroller counts
 * once it is on screen, as a visitor sees it.
 */
function measure(img: Locator): Promise<Miss | null> {
  return img.evaluate((el: HTMLImageElement) => {
    const len = (v: string, free: number) => (v.endsWith('%') ? (parseFloat(v) / 100) * free : parseFloat(v));
    const css = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // The painted box: the image's box, clipped by every ancestor that hides overflow.
    let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      left = Math.max(left, c.left);
      top = Math.max(top, c.top);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
    // Where the image's content sits inside its box.
    const nw = el.naturalWidth;
    const nh = el.naturalHeight;
    const fit = css.objectFit;
    const scale =
      fit === 'cover'
        ? Math.max(r.width / nw, r.height / nh)
        : fit === 'contain'
          ? Math.min(r.width / nw, r.height / nh)
          : fit === 'none'
            ? 1
            : NaN;
    const w = Number.isNaN(scale) ? r.width : nw * scale;
    const h = Number.isNaN(scale) ? r.height : nh * scale;
    const [px = '50%', py = '50%'] = css.objectPosition.split(' ');
    const [ax, ay] = (el.dataset.faceAnchor ?? '').split(' ').map(Number);
    const x = r.left + len(px, r.width - w) + (ax / 100) * w;
    const y = r.top + len(py, r.height - h) + (ay / 100) * h;
    const tol = 1;
    if (x >= left - tol && x <= right + tol && y >= top - tol && y <= bottom + tol) return null;
    return {
      src: el.currentSrc.replace(location.origin, ''),
      anchor: el.dataset.faceAnchor ?? '',
      point: [Math.round(x), Math.round(y)] as [number, number],
      box: [left, top, right, bottom].map(Math.round) as [number, number, number, number],
    };
  });
}

/**
 * Every displayed anchored photo on the page, scrolled into view, loaded and
 * measured. Hover previews that are display:none at this width are not painted,
 * so not checked. Returns how many were checked and the misses.
 */
async function checkPage(page: Page, only?: RegExp) {
  const all = page.locator('img[data-face-anchor]');
  const total = await all.count();
  const missed: Miss[] = [];
  let checked = 0;
  for (let i = 0; i < total; i++) {
    const img = all.nth(i);
    if (!(await img.isVisible())) continue;
    const src = (await img.getAttribute('src')) ?? '';
    if (only && !only.test(src)) continue;
    checked++;
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), {
        message: `${src} loads`,
        // A cold image optimizer encodes the large AVIF widths on first request.
        timeout: 45_000,
      })
      .toBe(true);
    const miss = await measure(img);
    if (miss) missed.push(miss);
  }
  return { checked, missed };
}

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    test(`faces stay painted on ${path} at ${vp.width}x${vp.height}`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize(vp);
      await page.goto(path);
      // Let the hero's settle animation finish before measuring.
      await page.waitForTimeout(2600);
      const { checked, missed } = await checkPage(page);
      // Gimnasios: the two partner photos (its hero, the BullBox wall, has no faces).
      expect(checked, 'anchored photos on the page').toBeGreaterThanOrEqual(path === '/' ? 8 : 2);
      expect(missed).toEqual([]);
    });
  }
}

test('the Inicio closing photo keeps its faces at every viewport', async ({ page }) => {
  test.setTimeout(180_000);
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.goto('/');
    const { checked, missed } = await checkPage(page, /close_team/);
    expect(checked, `${vp.width}x${vp.height}`).toBe(1);
    expect(missed, `${vp.width}x${vp.height}`).toEqual([]);
  }
});
