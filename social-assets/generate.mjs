// Tribe social asset generator — HTML/CSS → PNG via Playwright.
// Run from repo root:  node social-assets/generate.mjs
// Output: social-assets/out/*.png  (1080x1350 IG portrait)
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const SHOTS = 'file://' + path.join(__dirname, '..', 'public', 'onboarding');
const STOCK = 'file://' + path.join(__dirname, 'stock');
mkdirSync(OUT, { recursive: true });

const FONT = `<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">`;
const C = { dark: '#272D34', darker: '#1f242b', lime: '#A3E635', white: '#fff', gray: '#9CA3AF', blue: '#9EC9E2' };

const base = (body, bg) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:${bg};font-family:'Plus Jakarta Sans',sans-serif;overflow:hidden;position:relative}
.wrap{position:relative;z-index:2;padding:84px 76px;height:100%;display:flex;flex-direction:column}
.mark{font-size:46px;font-weight:800;letter-spacing:-1px}
.glow{position:absolute;top:-220px;right:-160px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(163,230,53,.16) 0%,rgba(163,230,53,0) 70%);z-index:1}
.phone{position:absolute;border-radius:40px;border:10px solid #0f1216;box-shadow:0 30px 80px rgba(0,0,0,.5);z-index:1}
.foot{margin-top:auto;font-size:27px;font-weight:700;letter-spacing:.5px}
.kick{font-size:30px;font-weight:700;letter-spacing:2px;text-transform:uppercase}
</style></head><body>${body}</body></html>`;

// ---- STYLE VARIATIONS (same message, 3 looks) ----
const message = { hl: 'entrenar', head: ['Encuentra con quién', '{hl} en Medellín.'], sub: 'Sesiones cerca de ti, por deporte y barrio.' };

const coverDarkLime = base(`
  <div class="glow"></div>
  <img class="phone" src="${SHOTS}/02-home.jpeg" style="right:56px;bottom:-40px;width:430px;transform:rotate(4deg)">
  <div class="wrap">
    <div class="mark" style="color:${C.white}">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="font-size:80px;font-weight:800;color:${C.white};line-height:1.04;margin-top:44px;max-width:760px">Encuentra con quién <span style="color:${C.lime}">entrenar</span> en Medellín.</div>
    <div style="font-size:30px;font-weight:500;color:${C.gray};margin-top:26px;max-width:560px">Sesiones cerca de ti, por deporte y barrio.</div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

const coverLimeBlock = base(`
  <div class="wrap">
    <div class="mark" style="color:${C.dark}">Tribe<span style="color:${C.white}">.</span></div>
    <div style="font-size:92px;font-weight:800;color:${C.dark};line-height:1.0;margin-top:60px;max-width:900px">Encuentra con quién entrenar en Medellín.</div>
    <div style="font-size:32px;font-weight:600;color:${C.dark};opacity:.75;margin-top:32px;max-width:680px">Sesiones cerca de ti, por deporte y barrio.</div>
    <div class="foot" style="color:${C.dark}">NUNCA ENTRENES SOLO</div>
  </div>`, C.lime);

const coverLightClean = base(`
  <img class="phone" src="${SHOTS}/02-home.jpeg" style="right:60px;bottom:-30px;width:420px;transform:rotate(3deg)">
  <div class="wrap">
    <div class="mark" style="color:${C.dark}">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="font-size:80px;font-weight:800;color:${C.dark};line-height:1.04;margin-top:44px;max-width:760px">Encuentra con quién <span style="color:#6f9e2f">entrenar</span> en Medellín.</div>
    <div style="font-size:30px;font-weight:500;color:#4B5563;margin-top:26px;max-width:540px">Sesiones cerca de ti, por deporte y barrio.</div>
    <div class="foot" style="color:#6f9e2f">NUNCA ENTRENES SOLO</div>
  </div>`, '#F4F6F2');

// ---- CAROUSEL (Package 3): 5 formas de no entrenar solo ----
const slide = (kick, big, sub, n) => base(`
  <div class="glow"></div>
  <div class="wrap">
    <div class="mark" style="color:${C.white}">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="margin-top:auto;margin-bottom:auto">
      ${kick ? `<div class="kick" style="color:${C.lime};margin-bottom:24px">${kick}</div>` : ''}
      <div style="font-size:${big.length>40?64:74}px;font-weight:800;color:${C.white};line-height:1.05;max-width:900px">${big}</div>
      ${sub ? `<div style="font-size:30px;font-weight:500;color:${C.gray};margin-top:28px;max-width:760px">${sub}</div>` : ''}
    </div>
    <div class="foot" style="color:${C.gray};font-weight:600">${n ? `${n} / 7` : 'NUNCA ENTRENES SOLO'}</div>
  </div>`, C.dark);

const carousel = [
  slide('Guía Medellín', '5 formas de no volver a <span style="color:'+C.lime+'">entrenar solo</span>.', '5 ways to never train alone in Medellín.', '1'),
  slide('1', 'Busca sesiones por tu barrio.', 'El Poblado, Laureles, Envigado, Sabaneta.', '2'),
  slide('2', 'Filtra por tu deporte.', 'Running, gym, yoga, ciclismo, lo que sea.', '3'),
  slide('3', 'Únete a un grupo que ya existe.', 'Llegas y ya hay gente esperándote.', '4'),
  slide('4', 'Crea tu propia sesión.', 'Tú pones el plan, otros se suman.', '5'),
  slide('5', 'Encuentra un instructor.', 'Descúbrelos por la ciudad, no solo por contactos.', '6'),
  slide('', 'Todo en una app. <span style="color:'+C.lime+'">Tribe</span>.', 'Descárgala. Nunca entrenes solo.', '7'),
];

// ---- FEATURE TILES (with app screenshots) ----
const feature = (head, hlWord, sub, shot, kick) => base(`
  <div class="glow"></div>
  <img class="phone" src="${SHOTS}/${shot}" style="right:54px;bottom:-50px;width:430px;transform:rotate(4deg)">
  <div class="wrap">
    <div class="mark" style="color:${C.white}">Tribe<span style="color:${C.lime}">.</span></div>
    <div class="kick" style="color:${C.blue};margin-top:40px">${kick}</div>
    <div style="font-size:76px;font-weight:800;color:${C.white};line-height:1.05;margin-top:18px;max-width:640px">${head.replace(hlWord, '<span style="color:'+C.lime+'">'+hlWord+'</span>')}</div>
    <div style="font-size:29px;font-weight:500;color:${C.gray};margin-top:24px;max-width:540px">${sub}</div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

const featureCreate = feature('Crea tu propia sesión en un minuto.', 'sesión', 'Pones dónde, cuándo y el precio. Compartes el link. Llega tu gente.', '06-create-session.jpeg', 'Para atletas');
const featureInstructor = feature('Tu vitrina profesional, sin hacer web.', 'vitrina', 'Apareces en Descubre Instructores. Recibes confirmaciones, propinas y reseñas.', '03-storefront.jpeg', 'Para instructores');

// ---- PARTNER / UGC: instructor spotlight (uses a partner photo) ----
// Drop the partner's photo in social-assets/stock/ and pass the filename.
const spotlight = (name, specialty, quote, photoFile) => base(`
  <img src="${STOCK}/${photoFile}" style="position:absolute;right:0;top:0;width:540px;height:1350px;object-fit:cover;z-index:0">
  <div style="position:absolute;right:0;top:0;width:560px;height:1350px;background:linear-gradient(to left, rgba(39,45,52,0) 0%, rgba(39,45,52,.6) 55%, #272D34 100%);z-index:1"></div>
  <div class="wrap">
    <div class="mark" style="color:#fff">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="margin-top:auto;max-width:600px">
      <div class="kick" style="color:${C.blue};margin-bottom:18px">Instructor en Tribe</div>
      <div style="font-size:74px;font-weight:800;color:${C.lime};line-height:1.0">${name}</div>
      <div style="font-size:30px;font-weight:600;color:${C.white};margin-top:10px">${specialty}</div>
      <div style="font-size:33px;font-weight:500;color:#e5e7eb;margin-top:30px;line-height:1.35;font-style:italic">“${quote}”</div>
    </div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

// ---- PARTNER / UGC: testimonial quote card (no photo needed) ----
const testimonial = (quote, name, specialty) => base(`
  <div class="glow"></div>
  <div class="wrap">
    <div class="mark" style="color:#fff">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="margin-top:auto">
      <div style="font-size:150px;font-weight:800;color:${C.lime};line-height:.6;height:80px">“</div>
      <div style="font-size:54px;font-weight:700;color:${C.white};line-height:1.2;max-width:880px">${quote}</div>
      <div style="margin-top:36px">
        <div style="font-size:30px;font-weight:700;color:${C.lime}">${name}</div>
        <div style="font-size:26px;font-weight:500;color:${C.gray}">${specialty}</div>
      </div>
    </div>
    <div class="foot" style="color:${C.gray};font-weight:600">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

const spotlightDemo = spotlight('Angie Gómez', 'Yoga y bienestar · El Poblado', 'Con Tribe llené mis clases con gente nueva que de verdad quería entrenar.', 'partner-portrait.jpg');
const testimonialDemo = testimonial('Dejé de perseguir alumnos por WhatsApp. Ahora me encuentran a mí.', 'Angie Gómez', 'Instructora de Yoga, Medellín');

// ---- PHOTO-OVERLAY (free stock photo + text) ----
const photoOverlay = base(`
  <img src="${STOCK}/running-group.jpg" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;z-index:0">
  <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(15,17,20,.93) 0%, rgba(15,17,20,.45) 45%, rgba(15,17,20,.25) 100%);z-index:1"></div>
  <div class="wrap">
    <div class="mark" style="color:#fff">Tribe<span style="color:${C.lime}">.</span></div>
    <div style="margin-top:auto">
      <div style="font-size:86px;font-weight:800;color:#fff;line-height:1.03;max-width:860px">Tu gente ya está <span style="color:${C.lime}">entrenando</span>.</div>
      <div style="font-size:30px;font-weight:500;color:#e5e7eb;margin-top:24px;max-width:680px">Encuéntralos en Tribe. Sesiones cerca de ti en Medellín.</div>
    </div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

// Photo-overlay needs a downloaded stock image in social-assets/stock/ (gitignored).
// Skip it on a fresh clone where no stock has been pulled yet.
const hasStock = existsSync(path.join(__dirname, 'stock', 'running-group.jpg'));
const hasPortrait = existsSync(path.join(__dirname, 'stock', 'partner-portrait.jpg'));

const jobs = [
  ['cover-1-darklime', coverDarkLime], ['cover-2-limeblock', coverLimeBlock], ['cover-3-lightclean', coverLightClean],
  ...(hasStock ? [['photo-overlay', photoOverlay]] : []),
  ['feature-create', featureCreate], ['feature-instructor', featureInstructor],
  ...(hasPortrait ? [['spotlight', spotlightDemo]] : []),
  ['testimonial', testimonialDemo],
  ...carousel.map((h, i) => [`carousel-${i + 1}`, h]),
];

const b = await chromium.launch();
for (const [name, html] of jobs) {
  // Write to a temp .html so file:// screenshot URLs resolve (setContent blocks them).
  const tmp = path.join(OUT, `_${name}.html`);
  writeFileSync(tmp, html);
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  await p.goto('file://' + tmp, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, `${name}.png`) });
  await p.close();
  rmSync(tmp);
  console.log('rendered', name);
}
await b.close();
console.log('DONE →', OUT);
