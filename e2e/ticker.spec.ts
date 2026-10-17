import { expect, test, type Page } from '@playwright/test';

/**
 * T-SITE1.1. The ticker's first item rests fully on screen at load: 16px in,
 * never past the right edge, whatever its length; a long one ends in an
 * ellipsis at the edge. Measured with the animation paused at its resting
 * position (it starts after two seconds).
 *
 * Run against a production build: PLAYWRIGHT_BASE_URL=http://localhost:3006
 * npx playwright test e2e/ticker.spec.ts
 */
const WIDTHS = [390, 1366];
const LONG = 'X'.repeat(60) + ' ' + 'Y'.repeat(59); // 120 characters

type Lead = { left: number; contentRight: number; viewport: number; truncated: boolean; overflow: string };

async function pausedHome(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '[class*="ticker"] [class*="run"] { animation-play-state: paused !important; }' });
}

/** Both copies' first item: where it starts and where its text ends. */
function leads(page: Page): Promise<Lead[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[class*="ticker"] [class*="lead"]')].map((el) => {
      const r = el.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(el).paddingRight);
      return {
        left: Math.round(r.left),
        contentRight: Math.round(r.right - pad),
        viewport: document.documentElement.clientWidth,
        truncated: el.scrollWidth > el.clientWidth,
        overflow: getComputedStyle(el).textOverflow,
      };
    })
  );
}

for (const width of WIDTHS) {
  test(`the first ticker item rests fully on screen at ${width}`, async ({ page }) => {
    await pausedHome(page, width);
    const [first, second] = await leads(page);
    expect(first.left).toBe(16);
    expect(first.contentRight).toBeLessThanOrEqual(first.viewport);
    // The loop's second copy carries the same cap, so both copies stay the same width.
    expect(second).toBeDefined();
  });

  test(`a 120-character first item ends in an ellipsis at the edge at ${width}`, async ({ page }) => {
    await pausedHome(page, width);
    await page.evaluate((text) => {
      for (const el of document.querySelectorAll<HTMLElement>('[class*="ticker"] [class*="lead"]')) {
        const textNode = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.textContent = text;
      }
    }, LONG);
    const [first, second] = await leads(page);
    expect(first.left).toBe(16);
    expect(first.contentRight).toBeLessThanOrEqual(first.viewport);
    expect(first.overflow).toBe('ellipsis');
    // On a phone 120 characters cannot fit, so the item is cut at the edge; on a
    // desktop they fit and nothing is cut.
    if (width < 600) expect(first.truncated).toBe(true);
    if (first.truncated) expect(first.contentRight).toBeGreaterThan(first.viewport - 8);
    expect(second.contentRight - second.left).toBe(first.contentRight - first.left);
  });
}
