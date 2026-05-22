import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(__dirname, 'guide-es.html');
const outPath = path.join(__dirname, '..', 'Tribe-Guia-Instructores.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
// Give web fonts a beat to settle.
await page.waitForTimeout(800);
await page.pdf({
  path: outPath,
  format: 'Letter',
  printBackground: true,
  margin: { top: '0.5in', bottom: '0.5in', left: '0.4in', right: '0.4in' },
});
await browser.close();
console.log('PDF written to', outPath);
