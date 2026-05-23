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
const C = { dark: '#272D34', darker: '#1f242b', lime: '#A3E635', limeDeep: '#84cc16', white: '#fff', gray: '#9CA3AF', blue: '#9EC9E2', blueDeep: '#6FA8C9' };
const LOGO = 'file://' + path.join(__dirname, '..', 'public');

// Real branded wordmark — white text + lime dot for dark bgs, dark text + lime dot for light bgs.
const markWhite = `<img class="mark" src="${LOGO}/tribe-wordmark.png" alt="Tribe">`;
const markDark = `<img class="mark" src="${LOGO}/tribe-wordmark-dark.png" alt="Tribe">`;

// Two atmospheric color blobs (lime + light blue) that break up flat charcoal and bring brand color forward.
const atmos = `<div class="glow-lime"></div><div class="glow-blue"></div>`;

const base = (body, bg) => `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>
*{margin:0;box-sizing:border-box}
body{width:1080px;height:1350px;background:${bg};font-family:'Plus Jakarta Sans',sans-serif;overflow:hidden;position:relative}
.wrap{position:relative;z-index:2;padding:84px 76px;height:100%;display:flex;flex-direction:column}
.mark{height:60px;width:182px;display:block;align-self:flex-start;object-fit:contain;flex-shrink:0}
.glow-lime{position:absolute;top:-300px;right:-220px;width:980px;height:980px;border-radius:50%;background:radial-gradient(circle,rgba(163,230,53,.42) 0%,rgba(163,230,53,.12) 35%,rgba(163,230,53,0) 65%);z-index:1}
.glow-blue{position:absolute;bottom:-300px;left:-220px;width:880px;height:880px;border-radius:50%;background:radial-gradient(circle,rgba(158,201,226,.30) 0%,rgba(158,201,226,.08) 40%,rgba(158,201,226,0) 65%);z-index:1}
.phone{position:absolute;border-radius:40px;border:10px solid #0f1216;box-shadow:0 30px 80px rgba(0,0,0,.55), 0 0 160px rgba(163,230,53,.22);z-index:1}
.foot{margin-top:auto;font-size:27px;font-weight:700;letter-spacing:.5px}
.kick{font-size:30px;font-weight:700;letter-spacing:2px;text-transform:uppercase;display:inline-flex;align-items:center;gap:16px}
.kick::before{content:'';display:inline-block;width:42px;height:5px;background:#A3E635;border-radius:3px}
.head{font-weight:800;letter-spacing:-1.6px;line-height:1.12}
.hl-pill{display:inline-block;background:#A3E635;color:#272D34;padding:2px 18px 6px;border-radius:10px;line-height:1.03;margin-right:10px;margin-left:2px;vertical-align:baseline}
</style></head><body>${body}</body></html>`;

// ---- STYLE VARIATIONS (same message, 3 looks) ----
const message = { hl: 'entrenar', head: ['Encuentra con quién', '{hl} en Medellín.'], sub: 'Sesiones cerca de ti, por deporte y barrio.' };

const coverDarkLime = base(`
  ${atmos}
  <img class="phone" src="${SHOTS}/02-home.jpeg" style="right:56px;bottom:-40px;width:430px;transform:rotate(4deg)">
  <div class="wrap">
    ${markWhite}
    <div class="head" style="font-size:82px;color:${C.white};margin-top:44px;max-width:780px">Encuentra con quién <span class="hl-pill">entrenar</span> en Medellín.</div>
    <div style="font-size:30px;font-weight:500;color:${C.gray};margin-top:30px;max-width:560px">Sesiones cerca de ti, por deporte y barrio.</div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

// Reusable lime-block builder — solid lime canvas, charcoal headline. Sparingly, for punchy quotes/announcements.
const limeBlock = (head, sub) => base(`
  <div style="position:absolute;top:-220px;left:-160px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.18) 0%,rgba(255,255,255,0) 65%);z-index:1"></div>
  <div class="wrap">
    ${markDark}
    <div class="head" style="font-size:104px;color:${C.dark};margin-top:60px;max-width:920px">${head}</div>
    <div style="font-size:32px;font-weight:600;color:${C.dark};opacity:.82;margin-top:40px;max-width:720px">${sub}</div>
    <div class="foot" style="color:${C.dark}">NUNCA ENTRENES SOLO</div>
  </div>`, C.lime);

const coverLimeBlock = limeBlock('Encuentra con quién entrenar en Medellín.', 'Sesiones cerca de ti, por deporte y barrio.');

const coverLightClean = base(`
  <div style="position:absolute;top:-260px;right:-180px;width:760px;height:760px;border-radius:50%;background:radial-gradient(circle,rgba(163,230,53,.32) 0%,rgba(163,230,53,0) 65%);z-index:1"></div>
  <div style="position:absolute;bottom:-220px;left:-200px;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle,rgba(158,201,226,.40) 0%,rgba(158,201,226,0) 65%);z-index:1"></div>
  <img class="phone" src="${SHOTS}/02-home.jpeg" style="right:60px;bottom:-30px;width:420px;transform:rotate(3deg)">
  <div class="wrap">
    ${markDark}
    <div class="head" style="font-size:82px;color:${C.dark};margin-top:44px;max-width:780px">Encuentra con quién <span style="background:${C.lime};color:${C.dark};padding:0 14px;border-radius:8px;display:inline-block;line-height:1.05">entrenar</span> en Medellín.</div>
    <div style="font-size:30px;font-weight:500;color:#4B5563;margin-top:30px;max-width:540px">Sesiones cerca de ti, por deporte y barrio.</div>
    <div class="foot" style="color:#5c8528">NUNCA ENTRENES SOLO</div>
  </div>`, '#F4F6F2');

// ---- CAROUSEL (Package 3): 5 formas de no entrenar solo ----
const slide = (kick, big, sub, n) => base(`
  ${atmos}
  <div class="wrap">
    ${markWhite}
    <div style="margin-top:auto;margin-bottom:auto">
      ${kick ? `<div class="kick" style="color:${C.lime};margin-bottom:28px">${kick}</div>` : ''}
      <div class="head" style="font-size:${big.length>40?64:74}px;color:${C.white};max-width:900px">${big}</div>
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
  ${atmos}
  <img class="phone" src="${SHOTS}/${shot}" style="right:54px;bottom:-50px;width:430px;transform:rotate(4deg)">
  <div class="wrap">
    ${markWhite}
    <div class="kick" style="color:${C.blue};margin-top:44px">${kick}</div>
    <div class="head" style="font-size:76px;color:${C.white};margin-top:22px;max-width:640px">${head.replace(hlWord, '<span class="hl-pill">'+hlWord+'</span>')}</div>
    <div style="font-size:29px;font-weight:500;color:${C.gray};margin-top:28px;max-width:540px">${sub}</div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

const featureCreate = feature('Crea tu propia sesión en un minuto.', 'sesión', 'Pones dónde, cuándo y el precio. Compartes el link. Llega tu gente.', '06-create-session.jpeg', 'Para atletas');
const featureInstructor = feature('Tu vitrina profesional, sin hacer web.', 'vitrina', 'Apareces en Descubre Instructores. Recibes confirmaciones, propinas y reseñas.', '03-storefront.jpeg', 'Para instructores');

// ---- DATED POSTS (real packages, one per run; demos above stay as style reference) ----
// 2026-05-22 (Fri) — Pillar 5 Athlete benefit · Style: Dark+Lime feature · Friday weekend hook
const post_2026_05_22 = feature(
  'Tu finde no es para entrenar solo.',
  'solo',
  'Descubre sesiones cerca, por deporte y barrio. El Poblado, Laureles, Envigado, Sabaneta.',
  '04-discover.jpeg',
  'Para atletas',
);

// 2026-05-25 (Mon) — Pillar 5 Athlete benefit · Style: Lime block · punchy quote opener
// Headline sourced from production landing page copy (components/marketing/landing/HowItWorksSection.tsx):
//   "Entrena con tu nuevo tribe — Aparece, suda, conecta con gente que también se presenta."
const post_2026_05_25 = limeBlock(
  'Aparece, suda, conecta.',
  'Con gente que también se presenta. Sesiones en El Poblado, Laureles, Envigado, Sabaneta.',
);

// 2026-05-27 (Wed) — Pillar 6 Value/education · Style: Dark carousel (7 slides) · Tribe vs WhatsApp groups
// Content sourced from ForAthletesSection production copy + INSTRUCTOR_ONBOARDING_GUIDE.md feature list.
const carousel_2026_05_27 = [
  slide('Guía Medellín', '5 cosas que <span style="color:'+C.lime+'">Tribe</span> te da que tu grupo de WhatsApp no.', '5 things Tribe gives you that a WhatsApp group cannot.', '1'),
  slide('1', 'Sesiones <span style="color:'+C.lime+'">por barrio</span>.', 'El Poblado, Laureles, Envigado, Sabaneta. Filtras, no scrolleas.', '2'),
  slide('2', 'Chat con gente que <span style="color:'+C.lime+'">entrenó contigo</span>.', 'Sin mensajes fríos. La conversación empieza donde empezó el sudor.', '3'),
  slide('3', 'Recordatorios <span style="color:'+C.lime+'">automáticos</span>.', 'La gente sí llega. Tú no cuentas cabezas en una hoja.', '4'),
  slide('4', 'Pagos <span style="color:'+C.lime+'">seguros</span>. Gratis o de pago.', 'Wompi o Stripe. Cero "te lo paso por Nequi mañana".', '5'),
  slide('5', 'Reseñas que <span style="color:'+C.lime+'">construyen reputación</span>.', 'Cada sesión cuenta. No se pierde en el scroll del grupo.', '6'),
  slide('', 'Todo en una app. <span style="color:'+C.lime+'">Tribe</span>.', 'Descárgala. Nunca entrenes solo.', '7'),
];

// 2026-05-29 (Fri) — Pillar 4 Instructor recruiting · Style: Dark+Lime feature · "Cobra por lo que enseñas"
// Headline pulled directly from production landing page (components/marketing/landing/TribeOSSection.tsx).
// Sub leverages the "85% es para ti" line from the For-Instructors track in HowItWorksSection.
const post_2026_05_29 = feature(
  'Cobra por lo que enseñas.',
  'Cobra',
  'Vitrina profesional, pagos en Wompi o Stripe, reseñas que construyen reputación. El 85% es para ti.',
  '03-storefront.jpeg',
  'Para instructores',
);

// ---- PARTNER / UGC: instructor spotlight (uses a partner photo) ----
// Drop the partner's photo in social-assets/stock/ and pass the filename.
const spotlight = (name, specialty, quote, photoFile) => base(`
  <div class="glow-blue" style="bottom:auto;top:-280px;left:-200px"></div>
  <img src="${STOCK}/${photoFile}" style="position:absolute;right:0;top:0;width:540px;height:1350px;object-fit:cover;z-index:0">
  <div style="position:absolute;right:0;top:0;width:560px;height:1350px;background:linear-gradient(to left, rgba(39,45,52,0) 0%, rgba(39,45,52,.6) 55%, #272D34 100%);z-index:1"></div>
  <div style="position:absolute;bottom:-260px;right:-180px;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle,rgba(163,230,53,.32) 0%,rgba(163,230,53,0) 65%);z-index:1"></div>
  <div class="wrap">
    ${markWhite}
    <div style="margin-top:auto;max-width:600px">
      <div class="kick" style="color:${C.blue};margin-bottom:22px">Instructor en Tribe</div>
      <div class="head" style="font-size:74px;color:${C.lime}">${name}</div>
      <div style="font-size:30px;font-weight:600;color:${C.white};margin-top:12px">${specialty}</div>
      <div style="font-size:33px;font-weight:500;color:#e5e7eb;margin-top:32px;line-height:1.35;font-style:italic">“${quote}”</div>
    </div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

// ---- PARTNER / UGC: testimonial quote card (no photo needed) ----
const testimonial = (quote, name, specialty) => base(`
  ${atmos}
  <div class="wrap">
    ${markWhite}
    <div style="margin-top:auto">
      <div style="font-size:180px;font-weight:800;color:${C.lime};line-height:.6;height:90px">“</div>
      <div style="font-size:54px;font-weight:700;color:${C.white};line-height:1.22;max-width:880px;letter-spacing:-.5px">${quote}</div>
      <div style="margin-top:40px;padding-left:18px;border-left:4px solid ${C.lime}">
        <div style="font-size:30px;font-weight:700;color:${C.lime}">${name}</div>
        <div style="font-size:26px;font-weight:500;color:${C.gray}">${specialty}</div>
      </div>
    </div>
    <div class="foot" style="color:${C.gray};font-weight:600">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);

const spotlightDemo = spotlight('Angie Gómez', 'Yoga y bienestar · El Poblado', 'Con Tribe llené mis clases con gente nueva que de verdad quería entrenar.', 'partner-portrait.jpg');
const testimonialDemo = testimonial('Dejé de perseguir alumnos por WhatsApp. Ahora me encuentran a mí.', 'Angie Gómez', 'Instructora de Yoga, Medellín');

// ---- PARTNER / UGC: session promo flyer (a partner's upcoming Tribe session) ----
const detailRow = (label, val) => `<div style="display:flex;align-items:baseline;gap:24px">
  <span style="font-size:24px;font-weight:700;color:${C.lime};text-transform:uppercase;letter-spacing:1px;width:180px">${label}</span>
  <span style="font-size:36px;font-weight:600;color:${C.white}">${val}</span></div>`;
const sessionPromo = (title, instructor, when, where, price) => base(`
  ${atmos}
  <div class="wrap">
    ${markWhite}
    <div class="kick" style="color:${C.blue};margin-top:48px">Sesión en Tribe</div>
    <div class="head" style="font-size:82px;color:#fff;margin-top:20px;max-width:860px">${title}</div>
    <div style="font-size:32px;font-weight:600;color:${C.lime};margin-top:14px">con ${instructor}</div>
    <div style="margin-top:auto;border-top:2px solid ${C.lime};padding-top:44px;display:flex;flex-direction:column;gap:30px">
      ${detailRow('Cuándo', when)}${detailRow('Dónde', where)}${detailRow('Precio', price)}
    </div>
    <div style="font-size:36px;font-weight:700;color:#fff;margin-top:48px">Únete en Tribe. <span style="color:${C.lime}">Link en bio.</span></div>
    <div class="foot" style="color:${C.lime}">NUNCA ENTRENES SOLO</div>
  </div>`, C.dark);
const sessionPromoDemo = sessionPromo('Yoga al amanecer', 'Angie Gómez', 'Sáb 24 May · 6:30 AM', 'El Poblado', 'Gratis');

// ---- PHOTO-OVERLAY (free stock photo + text) ----
const photoOverlay = base(`
  <img src="${STOCK}/running-group.jpg" style="position:absolute;inset:0;width:1080px;height:1350px;object-fit:cover;z-index:0">
  <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(15,17,20,.94) 0%, rgba(15,17,20,.55) 40%, rgba(15,17,20,.20) 100%);z-index:1"></div>
  <div style="position:absolute;top:-260px;right:-200px;width:780px;height:780px;border-radius:50%;background:radial-gradient(circle,rgba(163,230,53,.35) 0%,rgba(163,230,53,0) 60%);z-index:1;mix-blend-mode:screen"></div>
  <div style="position:absolute;bottom:-220px;left:-180px;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle,rgba(158,201,226,.25) 0%,rgba(158,201,226,0) 65%);z-index:1;mix-blend-mode:screen"></div>
  <div class="wrap">
    ${markWhite}
    <div style="margin-top:auto">
      <div class="head" style="font-size:86px;color:#fff;max-width:860px">Tu gente ya está <span class="hl-pill">entrenando</span>.</div>
      <div style="font-size:30px;font-weight:500;color:#e5e7eb;margin-top:28px;max-width:680px">Encuéntralos en Tribe. Sesiones cerca de ti en Medellín.</div>
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
  ['2026-05-22-weekend-discover', post_2026_05_22],
  ['2026-05-25-show-up-sweat-connect', post_2026_05_25],
  ...carousel_2026_05_27.map((h, i) => [`2026-05-27-whatsapp-vs-tribe-${i + 1}`, h]),
  ['2026-05-29-cobra-por-lo-que-ensenas', post_2026_05_29],
  ...(hasPortrait ? [['spotlight', spotlightDemo]] : []),
  ['testimonial', testimonialDemo],
  ['session-promo', sessionPromoDemo],
  ...carousel.map((h, i) => [`carousel-${i + 1}`, h]),
];

// Opt-in executablePath override via env (used when running in a sandbox where
// the default Playwright cache isn't where the chromium build landed). On your
// Mac this is a no-op — leave PLAYWRIGHT_EXEC unset and Playwright finds its
// own browser.
const b = await chromium.launch(process.env.PLAYWRIGHT_EXEC ? { executablePath: process.env.PLAYWRIGHT_EXEC } : {});
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
