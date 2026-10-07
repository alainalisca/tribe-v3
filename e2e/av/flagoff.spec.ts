/**
 * T-AV27c. With the athletes flag OFF, every surface the program added is a
 * real 404, the public pass page is untouched, and an app admin still reaches
 * /admin/atletas (spec section 3: admins are always on for signed-in
 * surfaces). The runner starts the server with the flag off for this project.
 */
import { test, expect } from '@playwright/test';
import { PARTNER_A, anonymous, signedIn } from './helpers';

test('@flag-off the program pages answer a real 404', async ({ browser, baseURL }) => {
  const base = baseURL as string;
  for (const [email, path] of [
    ['ana@av.local', '/atletas/'],
    ['bullbox@av.local', `/atletas/gym/${PARTNER_A}/`],
    ['bullbox@av.local', `/atletas/gym/${PARTNER_A}/ajustes/`],
    ['elena@av.local', `/atletas/gym/${PARTNER_A}/puerta/`],
    ['elena@av.local', '/pase/verificar/AV-CARB/'],
    ['bullbox@av.local', '/admin/atletas/'],
  ] as const) {
    await test.step(`${email} on ${path}`, async () => {
      const ctx = await signedIn(browser, email, base);
      const res = await (await ctx.newPage()).goto(path);
      expect(res?.status(), `${email} ${path}`).toBe(404);
      await ctx.close();
    });
  }
});

test('@flag-off the program routes answer 404', async ({ browser, baseURL }) => {
  const ctx = await signedIn(browser, 'elena@av.local', baseURL as string);
  const res = await ctx.request.post('/api/atletas/notify/', { data: { passCode: 'AV-CARB', event: 'arrived' } });
  expect(res.status()).toBe(404);
  await ctx.close();
});

test('@flag-off the public pass page is unchanged: 200, and no athlete chip', async ({ browser }) => {
  const ctx = await anonymous(browser);
  const page = await ctx.newPage();
  const res = await page.goto('/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Reclamar mi pase' })).toBeVisible();
  await expect(page.getByText('Te invita')).toHaveCount(0);
  await ctx.close();
});

test('@flag-off an app admin still reaches /admin/atletas (admins are always on)', async ({ browser, baseURL }) => {
  const ctx = await signedIn(browser, 'admin@av.local', baseURL as string);
  const res = await (await ctx.newPage()).goto('/admin/atletas/');
  expect(res?.status()).toBe(200);
  await ctx.close();
});
