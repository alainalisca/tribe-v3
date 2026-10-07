/**
 * T-AV29 (Al's phone scan, 2026-10-06). The coach at the door is signed out,
 * scans the guest's voucher QR, signs in, and must land back on THAT pass.
 *
 * Two things went wrong on a real iPhone, and this checks both:
 *   - the QR encoded http://localhost:3003/... , which a phone cannot reach.
 *     Here the QR is DECODED (rebuilt with the same qrcode-generator settings
 *     and compared module for module), never judged by its label: the label
 *     was all T-AV23 and T-AV27c ever checked, and it was right while the URL
 *     was wrong.
 *   - after login the coach must return to the exact /pase/verificar/{code}/
 *     URL, query included (?via=code from the typed-code path), and a
 *     returnTo pointing off-site must land on this site instead.
 */
import { test, expect, type Page } from '@playwright/test';
import qrcode from 'qrcode-generator';
import { anonymous, open } from './helpers';

/** The <path d> renderQrSvg (lib/qr/renderQrSvg.ts) draws for `data`. */
function qrPath(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  let d = '';
  const n = qr.getModuleCount();
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) if (qr.isDark(row, col)) d += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  return d;
}

async function signInAs(page: Page, email: string) {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('tribe-local-1234');
  await page.locator('form button[type="submit"]').first().click();
}

const pathAndSearch = (page: Page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};

test('a signed-out coach scans the voucher QR, signs in, and is back on the pass', async ({ browser, baseURL }) => {
  const base = baseURL as string;
  let passCode = '';
  let svgPath = '';

  await test.step('a guest claims a pass through an athlete link', async () => {
    const guest = await anonymous(browser);
    const page = await guest.newPage();
    await open(page, '/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ');
    await page.locator('#pase-name').fill('Scan Prueba');
    await page.locator('#pase-whatsapp').fill('300 555 7712');
    await page.locator('#pase-email').fill('scan.t29@guest.local');
    for (const group of await page.locator('form fieldset').all()) await group.locator('button').first().click();
    await page.locator('form input[type="checkbox"]').check();
    await page.waitForTimeout(2500);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/pase') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Reclamar mi pase' }).click(),
    ]);
    const body = (await response.json()) as { pass_code: string; qr_svg: string };
    passCode = body.pass_code;
    svgPath = body.qr_svg.match(/<path d="([^"]*)"/)?.[1] ?? '';
    await guest.close();
  });

  await test.step('the voucher QR encodes this app at the address the guest used', async () => {
    expect(svgPath).not.toBe('');
    expect(svgPath).toBe(qrPath(`${base}/pase/verificar/${passCode}/`));
    expect(svgPath).not.toBe(qrPath(`http://127.0.0.1:${new URL(base).port}/pase/verificar/${passCode}/`));
  });

  await test.step('signed out, the scanned URL goes to login and comes back to the same pass', async () => {
    const coach = await anonymous(browser);
    const page = await coach.newPage();
    await open(page, `/pase/verificar/${passCode}/`);
    await expect(page).toHaveURL(/\/auth\/\?returnTo=/);
    await signInAs(page, 'elena@av.local');
    await page.waitForURL((u) => u.pathname === `/pase/verificar/${passCode}/`);
    expect(pathAndSearch(page)).toBe(`/pase/verificar/${passCode}/`);
    await expect(page.getByRole('button', { name: 'Confirmar asistencia' })).toBeVisible();
    await coach.close();
  });

  await test.step('a typed code keeps ?via=code through the login', async () => {
    const coach = await anonymous(browser);
    const page = await coach.newPage();
    await open(page, `/pase/verificar/${passCode}/?via=code`);
    await signInAs(page, 'elena@av.local');
    await page.waitForURL((u) => u.pathname === `/pase/verificar/${passCode}/`);
    expect(pathAndSearch(page)).toBe(`/pase/verificar/${passCode}/?via=code`);
    await coach.close();
  });

  await test.step('a returnTo pointing off-site lands on this site', async () => {
    const coach = await anonymous(browser);
    const page = await coach.newPage();
    await open(page, `/auth/?returnTo=${encodeURIComponent('//evil.example/pase/verificar/x/')}`);
    await signInAs(page, 'elena@av.local');
    await page.waitForURL((u) => u.origin === new URL(base).origin && !u.pathname.startsWith('/auth'));
    expect(new URL(page.url()).origin).toBe(new URL(base).origin);
    await coach.close();
  });
});
