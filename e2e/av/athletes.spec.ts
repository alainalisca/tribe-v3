/**
 * T-AV27c. The Tribe Athletes loop, end to end, in a real browser against the
 * LOCAL stack with the athletes flag on. Run with `npm run test:e2e:av`.
 *
 * Two stories, because the seed has no captain who can owe a bonus:
 *
 *   SETUP, on Otro Gym (Prueba), whose program is off in the seed:
 *     the admin switches it on, the owner writes a welcome offer, the owner
 *     adds Diego with a WhatsApp, and Diego's home shows his link.
 *
 *   THE LOOP, on BullBox (Prueba), through Caro (an athlete, so a join owes a
 *   bonus): Caro's link, a guest claims and sees the voucher QR, the coach
 *   opens the pass and confirms, marks "Se inscribió", Caro's numbers move by
 *   one each and she is told twice, the owner marks the bonus paid, and the
 *   gym dashboard shows exactly what av_athletes_partner_summary says.
 *
 * Every step is a named test.step, so a failure names the step (the T-AV27c
 * mutation arm breaks the door confirm and checks the report names it).
 */
import { test, expect, type Page } from '@playwright/test';
import {
  ID,
  PARTNER_A,
  PARTNER_B,
  anonymous,
  open,
  myAthleteNotifications,
  rpcAs,
  signedIn,
  type SummaryTotals,
} from './helpers';

const metric = (page: Page, key: string) => page.locator(`[data-metric="${key}"]`).first().innerText();
const funnel = (page: Page, key: string) => page.locator(`[data-funnel="${key}"]`).getAttribute('data-value');

test('setup: admin switches a program on, the owner writes an offer and adds an athlete', async ({
  browser,
  baseURL,
}) => {
  const base = baseURL as string;

  await test.step('admin switches Otro Gym on', async () => {
    const ctx = await signedIn(browser, 'admin@av.local', base);
    const page = await ctx.newPage();
    await open(page, '/admin/atletas/');
    const card = page.locator(`[data-admin-program="${PARTNER_B}"]`);
    await expect(card).toHaveAttribute('data-active', 'false');
    // The checkbox shows the SAVED value and changes when the server answers, so
    // click and wait for the saved state rather than check() (which expects an
    // instant toggle).
    await card.locator('[data-action="set-active"]').click();
    await expect(card).toHaveAttribute('data-active', 'true');
    await ctx.close();
  });

  await test.step('the owner writes a welcome offer in Ajustes', async () => {
    const ctx = await signedIn(browser, 'otro@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/atletas/gym/${PARTNER_B}/ajustes/`);
    // Role-based: React streams content into a hidden container before swapping
    // it in, so a raw selector can briefly match twice; the accessible tree
    // only ever has what a person sees.
    await page
      .getByRole('group', { name: 'Oferta de bienvenida' })
      .getByRole('textbox', { name: 'Español' })
      .fill('Primer mes al 50% si te inscribes hoy.');
    await page.locator('[data-settings-save]').click();
    await expect(page.locator('[data-settings-status="saved"]')).toHaveText('Ajustes guardados');
    await ctx.close();
  });

  await test.step('the owner adds Diego with his WhatsApp', async () => {
    const ctx = await signedIn(browser, 'otro@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/atletas/gym/${PARTNER_B}/`);
    await page.getByRole('tab', { name: 'Atletas' }).click();
    await page.locator('[data-add-query]').fill('die');
    await page.locator('[data-add-search]').click();
    await page.locator(`[data-candidate="${ID(4)}"]`).click();
    await page.locator('[data-add-whatsapp]').fill('300 555 9876');
    await page.locator('[data-add-submit]').click();
    await expect(page.locator('[data-athlete-row]').filter({ hasText: 'Diego' })).toBeVisible();
    await ctx.close();
  });

  await test.step("Diego's home shows his link to Otro Gym", async () => {
    const ctx = await signedIn(browser, 'diego@av.local', base);
    const page = await ctx.newPage();
    await open(page, '/atletas/');
    await expect(page.locator('[data-athlete-link]')).toHaveValue(/\/pase\/otro-gym-prueba\/\?src=atleta&code=/);
    await ctx.close();
  });
});

test('the loop: link, claim, door, joined, numbers, bonus, dashboard', async ({ browser, baseURL }) => {
  const base = baseURL as string;
  const caro = await signedIn(browser, 'caro@av.local', base);
  const caroPage = await caro.newPage();
  let link = '';
  let passCode = '';
  const before = { invited: '', showedUp: '', joined: '' };

  await test.step("Caro's home: her link and her numbers before", async () => {
    await open(caroPage, '/atletas/');
    link = await caroPage.locator('[data-athlete-link]').inputValue();
    expect(link).toMatch(/\/pase\/bullbox-prueba\/\?src=atleta&code=CARO-P9R$/);
    before.invited = await metric(caroPage, 'invited');
    before.showedUp = await metric(caroPage, 'showedUp');
    before.joined = await metric(caroPage, 'joined');
  });

  await test.step('a guest opens the link, claims a pass and sees the voucher QR', async () => {
    const guest = await anonymous(browser);
    const page = await guest.newPage();
    await open(page, new URL(link).pathname + new URL(link).search);
    await expect(page.getByText('Te invita Caro').first()).toBeVisible();
    await page.locator('#pase-name').fill('Valentina Prueba');
    await page.locator('#pase-whatsapp').fill('300 555 7703');
    await page.locator('#pase-email').fill('valentina.e2e@guest.local');
    for (const group of await page.locator('form fieldset').all()) await group.locator('button').first().click();
    await page.locator('form input[type="checkbox"]').check();
    // The route refuses a form submitted under 2 seconds after it mounted (a bot guard).
    await page.waitForTimeout(2500);
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/pase') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Reclamar mi pase' }).click(),
    ]);
    expect(response.status()).toBe(200);
    passCode = ((await response.json()) as { pass_code: string }).pass_code;
    expect(passCode).toMatch(/^[A-Z]{2}-[A-Z2-9]{4}$/);
    await expect(page.locator('svg[role="img"]').first()).toBeVisible();
    await guest.close();
  });

  await test.step('the coach opens the pass and confirms attendance', async () => {
    const ctx = await signedIn(browser, 'elena@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/pase/verificar/${passCode}/`);
    await expect(page.getByText('Invitación de Caro')).toBeVisible();
    // The door tells the athlete after the confirm; wait for that call, as a
    // coach's page would simply stay open.
    const notified = page.waitForResponse((r) => r.url().includes('/api/atletas/notify'));
    await page.getByRole('button', { name: 'Confirmar asistencia' }).click();
    await expect(page.getByText('Asistencia confirmada')).toBeVisible();
    expect((await notified).status()).toBe(200);
    await ctx.close();
  });

  await test.step('the coach marks "Se inscribió"', async () => {
    const ctx = await signedIn(browser, 'elena@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/pase/verificar/${passCode}/`);
    const notified = page.waitForResponse((r) => r.url().includes('/api/atletas/notify'));
    await page.getByRole('button', { name: 'Se inscribió' }).click();
    await expect(page.getByText('Guardado')).toBeVisible();
    expect((await notified).status()).toBe(200);
    await ctx.close();
  });

  await test.step("Caro's numbers move by one each, and she was told twice", async () => {
    await caroPage.reload({ waitUntil: 'networkidle' });
    expect(await metric(caroPage, 'invited')).toBe(String(Number(before.invited) + 1));
    expect(await metric(caroPage, 'showedUp')).toBe(String(Number(before.showedUp) + 1));
    expect(await metric(caroPage, 'joined')).toBe(String(Number(before.joined) + 1));
    await expect
      .poll(async () => (await myAthleteNotifications('caro@av.local')).map((n) => n.message))
      .toEqual(expect.arrayContaining(['Valentina arrived at class', 'Valentina joined BullBox (Prueba)']));
  });

  await test.step('the owner marks the bonus paid', async () => {
    const ctx = await signedIn(browser, 'bullbox@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/atletas/gym/${PARTNER_A}/`);
    await page.getByRole('tab', { name: 'Invitados' }).click();
    await page.getByRole('button', { name: 'Miembros' }).click();
    const row = page.locator(`[data-guest-row="${passCode}"]`);
    await row.locator('[data-action="bonus-paid"]').click();
    await expect(row.locator('[data-bonus-settled]')).toBeVisible();
    await ctx.close();
  });

  await test.step("the gym dashboard shows exactly the summary's numbers", async () => {
    const summary = await rpcAs<{ totals: SummaryTotals }>('bullbox@av.local', 'av_athletes_partner_summary', {
      p_partner_id: PARTNER_A,
    });
    const ctx = await signedIn(browser, 'bullbox@av.local', base);
    const page = await ctx.newPage();
    await open(page, `/atletas/gym/${PARTNER_A}/`);
    for (const [attr, key] of [
      ['invited', 'invited'],
      ['showed_up', 'showed_up'],
      ['joined', 'joined'],
      ['to_close', 'to_close'],
      ['bonus_paid', 'bonus_settled'],
    ] as const) {
      expect(await funnel(page, attr), attr).toBe(String(summary.totals[key]));
    }
    await ctx.close();
  });

  await caro.close();
});
