import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ═══════════════════════════════════════════
// PALETTE — T-GROW3b: every card is WHITE
// ═══════════════════════════════════════════
//
// The cards were dark (#272D34) until 2026-10-08. The change is not cosmetic:
// a share card is where a stranger forms their first impression of a class, a
// coach or a gym, and on a dark card the PHOTO is the only light thing on the
// canvas, so the eye reads "Tribe, with something in it". On white, the photo
// and the gym's logo are the only coloured things, so the eye reads "this
// class" and Tribe is a signature at the bottom. That is the product posture
// in docs/Tribe_Founding_Document.md — Tribe's niche is promoting other people
// — expressed in a layout.
//
// CONTRAST. CLAUDE.md records measured ratios: NO green in this palette reaches
// AA as small text on a light surface (tribe-green-dark, the darkest, is
// 3.04:1 on white). So on these cards green is ONLY ever a fill, a dot or a
// rule — never a letterform. The availability pill is dark text on a pale green
// ground (12.6:1), which is the construction CLAUDE.md prescribes by name.
const WHITE = '#FFFFFF';
const INK = '#15181C'; // headline / primary text on white — 16.8:1
const INK_SOFT = '#3F464E'; // secondary text — 10.1:1
const MUTED = '#6B7280'; // tertiary text — 4.83:1, clears AA for body copy
const HAIRLINE = '#E5E7EB'; // dividers
const PILL_BG = '#F1FADF'; // pale green chip; INK on it measures 12.6:1
const DOT = '#7CB518'; // the pill's dot — a non-text mark, not copy
const GREEN = '#A3E635'; // brand lime: the accent rule under a pass headline
const PLACEHOLDER = '#F3F4F6'; // empty image well

// Split cache: short BROWSER max-age, long CDN s-maxage. The card is a pure
// function of the query string — every displayed value (title, sport, date,
// price, instructor, neighborhood, avatar, image) is a param — and Supabase
// storage URLs are content-addressed (timestamped filenames), so any data edit
// changes the URL and busts the cache. A stale hit is therefore impossible; the
// first scrape generates, every repeat scrape is a CDN HIT. Browser max-age is
// only 1h because a browser cache CANNOT be purged; the CDN s-maxage stays long
// (and is purgeable). A change to the card TEMPLATE in this file: the browser
// cache clears within an hour, but the long CDN s-maxage keeps serving the old
// render until you purge the CDN or add a cache-bust param.
const CACHE_CONTROL = 'public, no-transform, max-age=3600, s-maxage=31536000, stale-while-revalidate=604800';

// ═══════════════════════════════════════════
// FONTS — Plus Jakarta Sans
// ═══════════════════════════════════════════
//
// WHY THREE STATIC FILES AND NOT THE VARIABLE FONT. Google ships Plus Jakarta
// Sans as a VARIABLE font only (`PlusJakartaSans[wght].ttf`); there are no
// static TTFs upstream. Satori — the renderer behind next/og — reads a
// variable font's `fvar` table (the axis DEFINITIONS) but has no `gvar`
// support (the glyph outline MORPHING). Measured on this repo's bundled copy:
// `node_modules/next/dist/compiled/@vercel/og/index.node.js` contains `fvar`
// 10 times and `gvar` zero times. So handing Satori the variable file and
// asking for weight 800 renders the 400 default, SILENTLY — every weight on
// the card would look identical and the design would flatten with no error
// anywhere. These three files are real static instances cut from the genuine
// upstream variable font with fontTools' `varLib.instancer`, then subset to
// the characters a card can draw (Latin + Spanish diacritics + punctuation +
// digits). 16.7KB each, 50KB total, against 176KB for one non-working weight.
//
// Regenerating them: see scripts/buildOgFonts.py.
//
// `new URL(..., import.meta.url)` is the documented Next.js way to reference a
// binary asset from an edge route; the bundler inlines it, so there is no
// network fetch at render time. The promises are created ONCE at module scope
// and awaited per request, so an isolate decodes each font a single time.
const fontMedium = fetch(new URL('./fonts/PlusJakartaSans-Medium.ttf', import.meta.url)).then((r) => r.arrayBuffer());
const fontBold = fetch(new URL('./fonts/PlusJakartaSans-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer());
const fontExtraBold = fetch(new URL('./fonts/PlusJakartaSans-ExtraBold.ttf', import.meta.url)).then((r) =>
  r.arrayBuffer()
);

const FAMILY = 'Plus Jakarta Sans';

/**
 * Satori font descriptors. Three weights under one family name; Satori picks
 * the nearest declared weight for a given `fontWeight`, so 600 resolves to the
 * 700 cut rather than failing.
 *
 * Returns [] if a font fails to load, which makes the card fall back to the
 * renderer's default face instead of throwing the whole render. A card in the
 * wrong typeface is a bad card; a card that 500s is no card at all, and the
 * scraper caches the failure.
 */
async function loadFonts() {
  try {
    const [medium, bold, extraBold] = await Promise.all([fontMedium, fontBold, fontExtraBold]);
    return [
      { name: FAMILY, data: medium, weight: 500 as const, style: 'normal' as const },
      { name: FAMILY, data: bold, weight: 700 as const, style: 'normal' as const },
      { name: FAMILY, data: extraBold, weight: 800 as const, style: 'normal' as const },
    ];
  } catch {
    return [];
  }
}

/** Shared ImageResponse options: fixed 1200x630 card, fonts, cache header. */
async function ogOptions() {
  return {
    width: 1200,
    height: 630,
    fonts: await loadFonts(),
    headers: { 'Cache-Control': CACHE_CONTROL },
  };
}

/** The base style every card root shares. */
const CARD_ROOT = {
  width: '100%',
  height: '100%',
  display: 'flex',
  backgroundColor: WHITE,
  fontFamily: FAMILY,
} as const;

/**
 * Hard ceiling on any transform request, regardless of what a caller asks for.
 * The session background used to ask for width=1200 against sources that are
 * often already 1200px, so the transform saved 8% and did nothing useful. This
 * is the clamp half of the budget: a caller cannot request an arbitrarily large
 * render, whatever the source dimensions are.
 */
const MAX_TRANSFORM_WIDTH = 640;

/**
 * Hard ceiling on the bytes of any single source image embedded in a card.
 *
 * This is the teeth of the budget, and it guards the path the width clamp
 * cannot: loadImage falls back to the ORIGINAL object URL when the transform is
 * unavailable, and the original is whatever the host uploaded — potentially a
 * 4000px, multi-megabyte photo, embedded whole. Over this limit the image is
 * dropped and the card falls back to its clean no-photo layout, which is a
 * worse-looking card but a bounded one.
 *
 * 150KB is ~1.6x the measured 640/q60 transform of a real session photo
 * (90,757 bytes), so ordinary photos pass and outliers do not.
 */
const MAX_SOURCE_BYTES = 150_000;

/**
 * Rewrite a Supabase public-object URL to the render/image transform endpoint
 * so we fetch a DISPLAY-SIZED jpeg instead of the full-resolution original
 * (e.g. a 1638px, 132KB avatar drawn as a 52px dot). Verified available on this
 * project's plan. Non-Supabase URLs (the local wordmark) pass through
 * unchanged.
 *
 * Width is clamped to MAX_TRANSFORM_WIDTH. Note the transform constrains WIDTH
 * only, not height: asking for 640 against a 1200x675 source returns 640x675,
 * not 640x360. That is fine for an image that gets scaled to cover.
 */
function toTransformUrl(url: string, width: number, quality = 75): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  const w = Math.min(width, MAX_TRANSFORM_WIDTH);
  return `${base}${sep}width=${w}&quality=${quality}`;
}

/**
 * Fetch an image ONCE and return it as a data URI that Satori embeds without a
 * second network round-trip (the old imageLoads() did a full validation GET and
 * then Satori re-fetched the same bytes — every source pulled twice). Returns
 * '' on any failure or non-image response, so the caller falls back to a clean
 * layout instead of a blank/errored card — Satori throws the whole render if an
 * <img src> fails to load.
 */
async function fetchAsDataUri(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return '';
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Budget ceiling. Checked AFTER the fetch rather than from Content-Length,
    // because the transform endpoint does not always declare one and a missing
    // header would silently skip the check — the same class of mistake as
    // asserting a Content-Length that never reaches the wire. Returning ''
    // takes the caller down its existing clean-fallback path.
    if (bytes.byteLength > MAX_SOURCE_BYTES) return '';
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return '';
  }
}

/**
 * Load a source image at display size: try the resized transform first; if the
 * transform is unavailable (non-200) fall back to the ORIGINAL URL; if neither
 * loads return '' (clean no-photo / initials fallback).
 */
async function loadImage(rawUrl: string, width: number, quality = 75): Promise<string> {
  if (!rawUrl) return '';
  const transformed = toTransformUrl(rawUrl, width, quality);
  const resized = await fetchAsDataUri(transformed);
  if (resized) return resized;
  // Fallback to the ORIGINAL object URL. This is the unbounded path — the
  // original is whatever the host uploaded — which is exactly why
  // fetchAsDataUri enforces MAX_SOURCE_BYTES rather than trusting the width
  // clamp alone. A too-large original returns '' and the card renders clean.
  return transformed === rawUrl ? '' : fetchAsDataUri(rawUrl);
}

/**
 * Drain the ImageResponse stream fully, then return the bytes as a plain
 * Response.
 *
 * ⚠ CORRECTION. An earlier version of this comment claimed this sets an
 * explicit Content-Length and thereby fixes link previews. BOTH CLAIMS WERE
 * WRONG and the second was never established.
 *
 * Content-Length is a FORBIDDEN HEADER NAME in the Fetch API: Headers.set on it
 * is silently ignored, and Vercel's edge frames the body as
 * Transfer-Encoding: chunked regardless. Measured on the deployed code, on a
 * fresh cache MISS, forced to HTTP/1.1, on the smallest card (type=default,
 * 10,988 bytes): chunked, no Content-Length. The header this function tried to
 * set does not reach the wire, so the setHeader call was dropped.
 *
 * What buffering DOES change is delivery timing: bytes leave only once the
 * render has finished, rather than trickling as Satori produces them.
 * WHETHER THAT MATTERS IS UNESTABLISHED. It is not known to fix link previews
 * and must not be described as doing so. It is kept — rather than reverted —
 * only because /i and /g flipped from failing to rendering around the same
 * deploy and nobody has isolated why; removing it blind risks re-breaking a
 * working state for an unproven mechanism.
 *
 * Cost of buffering: the whole card is held in memory.
 *
 * Tests: app/api/og/route.buffering.test.ts — which asserts the stream is
 * drained before returning, NOT that any header is set.
 */
async function bufferBody(res: Response): Promise<Response> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Copy the ImageResponse's own headers: content-type: image/png, plus the
  // Cache-Control from ogOptions. Both of these DO survive to the wire.
  const headers = new Headers(res.headers);
  return new Response(bytes, { status: res.status, headers });
}

export async function GET(request: NextRequest) {
  return bufferBody(await renderCard(request));
}

async function renderCard(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get('type') ?? 'default';
  const title = searchParams.get('title') ?? '';
  const subtitle = searchParams.get('subtitle') ?? '';
  const sub2 = searchParams.get('sub2') ?? '';
  const sport = searchParams.get('sport') ?? '';
  const date = searchParams.get('date') ?? '';
  const price = searchParams.get('price') ?? '';
  const instructor = searchParams.get('instructor') ?? '';
  const avatar = searchParams.get('avatar') ?? '';
  const spots = searchParams.get('spots') ?? '';
  const venue = searchParams.get('venue') ?? '';
  const neighborhood = searchParams.get('neighborhood') ?? '';
  const image = searchParams.get('image') ?? '';

  // The DARK wordmark (dark letterforms + lime dot) — the white-card counterpart
  // of /tribe-wordmark.png, which is the white-on-dark cut and would be
  // invisible here.
  const logoUrl = `${new URL(request.url).origin}/tribe-wordmark-dark.png`;

  if (type === 'session') {
    // The hero photo is drawn at 510x552 and requested at 560/q58. It is a
    // real photograph on an otherwise blank canvas, and next/og emits LOSSLESS
    // PNG, so the card's byte cost tracks the AREA of photographic pixels —
    // see the budget note on renderSession.
    // The avatar is requested at HERO size when there is no session photo,
    // because it is then painted at 510x552 rather than in a 58px circle.
    // Asking for 120 either way produced a visibly soft, upscaled hero — the
    // transform width has to match the role the image will play, not the name
    // of the param it arrived in.
    const avatarWidth = image ? 120 : 560;
    const [bg, av, logo] = await Promise.all([
      loadImage(image, 560, 58),
      loadImage(avatar, avatarWidth, image ? 75 : 62),
      loadImage(logoUrl, 300),
    ]);
    return renderSession({
      title,
      sport,
      date,
      price,
      instructor,
      avatar: av,
      spots,
      venue,
      neighborhood,
      image: bg,
      logo,
    });
  }

  // ── The split family: a big hero on the left, copy on the right ──
  // 'pass' and 'gym' are the same construction with a different star: a pass
  // leads with the OFFER, a gym page leads with the gym's NAME. 'instructor'
  // is the same again with a circular hero, because people are circles and
  // organisations are rounded squares (T-GYM1's grammar, which a link preview
  // is the last place to harmonise away).
  if (type === 'pass' || type === 'gym' || type === 'instructor') {
    const hero = await loadImage(avatar, 560);
    const logo = await loadImage(logoUrl, 300);
    return renderSplit({
      headline: title || (type === 'instructor' ? instructor : 'Tribe'),
      sub1: subtitle,
      sub2,
      hero,
      logo,
      shape: type === 'instructor' ? 'circle' : 'square',
      // Only the pass card gets the accent rule under its headline: it marks
      // an OFFER, and putting it on every card would make it mean nothing.
      accent: type === 'pass',
      // A gym's logo must never be cropped — a cropped logo is a damaged
      // brand. A person's avatar is a photo and crops fine.
      fit: type === 'instructor' ? 'cover' : 'contain',
    });
  }

  if (type === 'achievement') {
    const emoji = searchParams.get('emoji') ?? '🏆';
    const userName = searchParams.get('userName') ?? '';
    const logo = await loadImage(logoUrl, 300);
    return renderAchievement({ title, emoji, userName, logo });
  }

  const logo = await loadImage(logoUrl, 300);
  return renderDefault(logo);
}

// ═══════════════════════════════════════════
// SHARED PIECES
// ═══════════════════════════════════════════

/**
 * The Tribe signature: wordmark with "Never Train Alone" on its own line
 * underneath. Small, bottom-aligned, on every card.
 *
 * It is a SIGNATURE, not a header — the thing being shared is the star and
 * Tribe is who vouches for it. The text fallback exists because the wordmark
 * is fetched over the network from our own origin, and a cold edge region can
 * miss it; a card with the word "Tribe" set in the card's own typeface is a
 * fine degradation, a card that throws is not.
 */
function Signature({ logo, width = 132 }: { logo?: string; width?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {logo ? (
        <img src={logo} alt="" width={width} height={Math.round((width * 564) / 1709)} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: '38px', fontWeight: 800, color: INK, letterSpacing: '-1px' }}>Tribe</span>
          <span style={{ fontSize: '38px', fontWeight: 800, color: GREEN }}>.</span>
        </div>
      )}
      <span style={{ fontSize: '17px', fontWeight: 500, color: MUTED, marginTop: '4px' }}>Never Train Alone</span>
    </div>
  );
}

/**
 * A cropped image well.
 *
 * ⚠ DO NOT REWRITE THIS AS A CSS background-image. It was written that way
 * first, to get `background-position: center top` for the face-safe crop, and
 * the bundled Satori DOES NOT IMPLEMENT `background-size: cover` — it paints
 * the image at its NATURAL size, anchored top-left, and clips.
 *
 * That failure is invisible in the common case, which is what makes it worth a
 * warning rather than a one-line fix. Measured 2026-10-08: the session hero
 * well is 510x552 and its source is transformed to 560px wide, so painting at
 * natural size top-left filled the well and looked exactly like a cover crop.
 * The same code in the 58px coach circle, fed a 120px source, rendered a grey
 * box. One construction, two sizes, and only the small one told the truth.
 *
 * `object-fit` on an <img> IS implemented — it is what the dark cards used — so
 * the well is an <img> in a clipping box. `objectPosition` is NOT applied: it
 * was measured as having no effect here, and leaving it in the source would
 * read as a face-safe crop that is not one. The crop is therefore CENTRED,
 * which for a gym photo is the ordinary case and keeps heads in frame far more
 * often than the top-left anchor it replaces.
 */
function PhotoWell({
  src,
  width,
  height,
  radius,
  fit = 'cover',
}: {
  src: string;
  width: number;
  height: number;
  radius: number;
  fit?: 'cover' | 'contain';
}) {
  return (
    <div
      style={{
        display: 'flex',
        width: `${width}px`,
        height: `${height}px`,
        flexShrink: 0,
        borderRadius: `${radius}px`,
        backgroundColor: fit === 'contain' ? WHITE : PLACEHOLDER,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img src={src} alt="" width={width} height={height} style={{ objectFit: fit }} />
    </div>
  );
}

/** Initials well, for when no image loaded. Same footprint as PhotoWell. */
function InitialsWell({
  text,
  width,
  height,
  radius,
  fontSize,
}: {
  text: string;
  width: number;
  height: number;
  radius: number;
  fontSize: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        width: `${width}px`,
        height: `${height}px`,
        flexShrink: 0,
        borderRadius: `${radius}px`,
        backgroundColor: PILL_BG,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ fontSize: `${fontSize}px`, fontWeight: 800, color: INK, letterSpacing: '-2px' }}>
        {text || '?'}
      </span>
    </div>
  );
}

/** First letters of up to `n` words, uppercased. "CrossFit BullBox" -> "CB". */
function initials(name: string, n: number): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, n)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Mean advance width of a Plus Jakarta Sans ExtraBold glyph as a fraction of
 * the font size, over mixed-case Spanish. Measured from the cut this route
 * embeds rather than assumed: the capital 'H' advance is 732/1000 em and
 * lowercase runs narrower, and 0.52 is the blended figure that matched the
 * observed wrap points on "Tu primera clase gratis en BullBox".
 */
const AVG_GLYPH_RATIO = 0.52;

/**
 * Pick the largest size from a ladder at which the headline still fits in
 * `maxLines` at `width`.
 *
 * Satori gives no text metrics before layout, so the line count is ESTIMATED
 * from an average glyph width. That estimate is the whole reason this is a
 * search over a ladder rather than a formula: being one step too small costs a
 * little presence, being one step too large costs the layout, so the loop
 * takes the first size that fits and never the last that might.
 *
 * It replaces a character-count ladder that ignored the column width entirely.
 * That version sized "Tu primera clase gratis en BullBox" to its floor and
 * then let it run OFF THE RIGHT EDGE of the card, because a bare <span> in a
 * flexGrow column has no bound to wrap against — the text was both too small
 * AND overflowing, which is the tell that the sizing and the wrapping were
 * never connected. Both ends are fixed here: this picks the size, and the
 * caller gives the column an explicit width so the wrap has something to
 * happen at.
 */
function fitHeadline(
  text: string,
  width: number,
  ladder: number[],
  maxLines: number,
  maxHeight: number,
  lineHeight: number
): number {
  const chars = Math.max(1, text.length);
  for (const size of ladder) {
    const lines = Math.ceil((chars * AVG_GLYPH_RATIO * size) / width);
    // BOTH conditions, and the second is the one that was missing. A pure
    // line-count test accepted 96px over three lines on the pass card: 305px
    // of headline in a 410px column that also had to hold a rule, two
    // subtitles and the signature, so the text printed straight THROUGH
    // everything below it. "It wraps" and "it fits" are different questions
    // and only the second one is about the card.
    if (lines <= maxLines && lines * size * lineHeight <= maxHeight) return size;
  }
  return ladder[ladder.length - 1];
}

/**
 * Explicit copy-column widths, derived from each layout's own boxes.
 *
 * These are arithmetic, not taste, and they are written down because the
 * alternative — letting flexGrow decide — is what allowed a headline to
 * overflow the canvas. If a padding or a hero size changes, this changes with
 * it or the text wraps in the wrong place.
 *
 *   session: 1200 − 40 (pad) − 510 (hero) − 48 (gap) − 40 (pad) = 562
 *   split:   1200 − 56 (pad) − 420 (hero) − 1 (rule) − 58 (gap) − 56 (pad) = 609
 */
const SESSION_COPY_WIDTH = 562;
const SPLIT_COPY_WIDTH = 609;

// ═══════════════════════════════════════════
// SESSION CARD  (mock_session_card.png)
// ═══════════════════════════════════════════

interface SessionParams {
  title: string;
  sport: string;
  date: string;
  price: string;
  instructor: string;
  avatar: string;
  spots: string;
  venue: string;
  neighborhood: string;
  /** Validated, loadable session photo data URI. Empty = coach-avatar hero. */
  image?: string;
  /** Validated, loadable wordmark data URI. Empty = text fallback. */
  logo?: string;
}

/**
 * The session card: photo left, everything else right.
 *
 * ── THE HEADLINE IS DRAWN ONCE, AND THAT IS A FIX ──
 * The dark card drew `sport` as a big green eyebrow AND `title` underneath, so
 * a session titled "HYROX" whose sport is "HYROX" printed the word twice. The
 * caller now resolves ONE headline (lib/share/cardCopy.ts#cardHeadline) and
 * this function has no second string to draw. `p.sport` survives as a fallback
 * ONLY, for a caller that sends no title at all.
 *
 * ── BYTE BUDGET ──
 * next/og emits LOSSLESS PNG, so a card's size tracks the AREA of photographic
 * pixels on the canvas, not the source resolution. Measured on the old dark
 * card with one real session photo: 300x300 thumbnail 244,125 B; 1200x200 band
 * 459,767 B; full-bleed 1,148,866 B; no photo at all 30,167 B.
 *
 * This layout's photo is 510x552 — 3.1x the area of that 300x300 thumbnail —
 * so the projection was ~760KB and the mitigation is in the SOURCE, not the
 * canvas: the transform is requested at 560/q58, and a softer JPEG carries less
 * high-frequency detail for PNG to encode losslessly. Everything around the
 * photo is flat white, which costs almost nothing. The actual measured size is
 * recorded in the T-GROW3b progress log rather than guessed at here.
 */
async function renderSession(p: SessionParams) {
  const headline = (p.title || p.sport.replace(/_/g, ' ')).trim() || 'Entrenamiento';
  const venueLine = [p.venue, p.neighborhood].filter(Boolean).join(' · ');
  const isFull = p.spots === 'Cupos agotados';

  // No session photo: the coach's own face becomes the hero rather than an
  // empty box. A card with a blank well looks broken; a card led by the coach
  // is still a card about a person you might train with.
  const heroSrc = p.image || p.avatar;

  return new ImageResponse(
    <div style={{ ...CARD_ROOT, padding: '39px 40px', alignItems: 'center' }}>
      {/* ── HERO ── */}
      {heroSrc ? (
        <PhotoWell src={heroSrc} width={510} height={552} radius={28} />
      ) : (
        <InitialsWell
          text={initials(p.instructor || headline, 2)}
          width={510}
          height={552}
          radius={28}
          fontSize={160}
        />
      )}

      {/* ── COPY COLUMN ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: `${SESSION_COPY_WIDTH}px`,
          flexShrink: 0,
          height: '552px',
          marginLeft: '48px',
          paddingTop: '18px',
        }}
      >
        {p.spots && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              alignSelf: 'flex-start',
              backgroundColor: isFull ? '#F3F4F6' : PILL_BG,
              borderRadius: '999px',
              padding: '9px 20px 9px 16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '11px',
                height: '11px',
                borderRadius: '999px',
                backgroundColor: isFull ? MUTED : DOT,
                marginRight: '10px',
              }}
            />
            <span style={{ fontSize: '24px', fontWeight: 700, color: isFull ? INK_SOFT : INK }}>{p.spots}</span>
          </div>
        )}

        <span
          style={{
            fontSize: `${fitHeadline(headline, SESSION_COPY_WIDTH, [104, 86, 72, 60, 50, 42], 2, 130, 1.04)}px`,
            fontWeight: 800,
            color: INK,
            letterSpacing: '-3px',
            lineHeight: 1.04,
            marginBottom: '18px',
          }}
        >
          {headline}
        </span>

        {p.date && (
          <span style={{ fontSize: '35px', fontWeight: 700, color: INK, lineHeight: 1.25, marginBottom: '6px' }}>
            {p.date}
          </span>
        )}
        {venueLine && (
          <span style={{ fontSize: '30px', fontWeight: 500, color: MUTED, lineHeight: 1.25, marginBottom: '6px' }}>
            {venueLine}
          </span>
        )}
        {p.price && (
          <span style={{ fontSize: '30px', fontWeight: 700, color: INK_SOFT, lineHeight: 1.25 }}>{p.price}</span>
        )}

        {/* Pushes the coach row + signature to the bottom of the column, so
              the card's baseline stays put whatever the copy above does. */}
        <div style={{ display: 'flex', flexGrow: 1 }} />

        {p.instructor && (
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '22px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', height: '1px', backgroundColor: HAIRLINE, marginBottom: '20px' }} />
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {p.avatar && p.image ? (
                <PhotoWell src={p.avatar} width={58} height={58} radius={29} />
              ) : (
                <InitialsWell text={initials(p.instructor, 1)} width={58} height={58} radius={29} fontSize={26} />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '18px' }}>
                <span style={{ fontSize: '21px', fontWeight: 500, color: MUTED, lineHeight: 1.2 }}>Con</span>
                <span style={{ fontSize: '28px', fontWeight: 700, color: INK, lineHeight: 1.2 }}>{p.instructor}</span>
              </div>
            </div>
          </div>
        )}

        <Signature logo={p.logo} />
      </div>
    </div>,
    await ogOptions()
  );
}

// ═══════════════════════════════════════════
// SPLIT CARD  (mock_B_split.png)
// pass · gym · instructor
// ═══════════════════════════════════════════

interface SplitParams {
  headline: string;
  sub1: string;
  sub2: string;
  hero: string;
  logo?: string;
  shape: 'circle' | 'square';
  accent: boolean;
  fit: 'cover' | 'contain';
}

/**
 * Hero left, copy right, a hairline rule between them.
 *
 * The hero is 400px square and `contain`-fitted for an organisation, so a wide
 * wordmark logo and a tall badge logo both sit correctly inside the same well
 * without either being cropped. A person's avatar is `cover`-fitted in a
 * circle, which is the shape people have everywhere else in the app.
 */
async function renderSplit(p: SplitParams) {
  const radius = p.shape === 'circle' ? 200 : 24;
  return new ImageResponse(
    <div style={{ ...CARD_ROOT, padding: '60px 56px', alignItems: 'center' }}>
      {/* ── HERO ── */}
      <div
        style={{
          display: 'flex',
          width: '420px',
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {p.hero ? (
          <PhotoWell src={p.hero} width={400} height={400} radius={radius} fit={p.fit} />
        ) : (
          <InitialsWell text={initials(p.headline, 2)} width={400} height={400} radius={radius} fontSize={130} />
        )}
      </div>

      {/* ── DIVIDER ── */}
      <div style={{ display: 'flex', width: '1px', height: '410px', backgroundColor: HAIRLINE, flexShrink: 0 }} />

      {/* ── COPY ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: `${SPLIT_COPY_WIDTH}px`,
          flexShrink: 0,
          marginLeft: '58px',
        }}
      >
        <span
          style={{
            fontSize: `${fitHeadline(p.headline, SPLIT_COPY_WIDTH, [96, 82, 70, 60, 52, 44], 2, 215, 1.06)}px`,
            fontWeight: 800,
            color: INK,
            letterSpacing: '-2.5px',
            lineHeight: 1.06,
          }}
        >
          {p.headline}
        </span>

        {p.accent && (
          <div
            style={{
              display: 'flex',
              width: '76px',
              height: '7px',
              borderRadius: '4px',
              backgroundColor: GREEN,
              marginTop: '26px',
            }}
          />
        )}

        {p.sub1 && (
          <span
            style={{
              fontSize: '33px',
              fontWeight: 700,
              color: INK,
              lineHeight: 1.25,
              marginTop: p.accent ? '28px' : '26px',
            }}
          >
            {p.sub1}
          </span>
        )}
        {p.sub2 && (
          <span style={{ fontSize: '28px', fontWeight: 500, color: MUTED, lineHeight: 1.3, marginTop: '8px' }}>
            {p.sub2}
          </span>
        )}

        <div style={{ display: 'flex', marginTop: '46px' }}>
          <Signature logo={p.logo} />
        </div>
      </div>
    </div>,
    await ogOptions()
  );
}

// ═══════════════════════════════════════════
// ACHIEVEMENT CARD
// ═══════════════════════════════════════════

interface AchievementParams {
  title: string;
  emoji: string;
  userName: string;
  logo?: string;
}

async function renderAchievement(p: AchievementParams) {
  return new ImageResponse(
    <div
      style={{
        ...CARD_ROOT,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px',
      }}
    >
      <div style={{ display: 'flex', fontSize: '96px', marginBottom: '28px' }}>{p.emoji}</div>
      <span
        style={{
          fontSize: '54px',
          fontWeight: 800,
          color: INK,
          textAlign: 'center',
          letterSpacing: '-1.5px',
          lineHeight: 1.1,
          marginBottom: '16px',
          maxWidth: '860px',
        }}
      >
        {p.title}
      </span>
      {p.userName && (
        <span style={{ fontSize: '28px', fontWeight: 700, color: INK_SOFT, marginBottom: '48px' }}>{p.userName}</span>
      )}
      <div style={{ display: 'flex', position: 'absolute', bottom: '46px' }}>
        <Signature logo={p.logo} />
      </div>
    </div>,
    await ogOptions()
  );
}

// ═══════════════════════════════════════════
// DEFAULT CARD
// ═══════════════════════════════════════════

async function renderDefault(logo: string) {
  return new ImageResponse(
    <div
      style={{
        ...CARD_ROOT,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px',
      }}
    >
      {logo ? (
        <img src={logo} alt="" width={420} height={Math.round((420 * 564) / 1709)} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: '110px', fontWeight: 800, color: INK, letterSpacing: '-4px' }}>Tribe</span>
          <span style={{ fontSize: '110px', fontWeight: 800, color: GREEN }}>.</span>
        </div>
      )}
      <span style={{ fontSize: '30px', fontWeight: 500, color: MUTED, marginTop: '18px' }}>Never Train Alone</span>
    </div>,
    await ogOptions()
  );
}
