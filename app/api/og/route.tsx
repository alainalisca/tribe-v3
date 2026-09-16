import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const DARK_BG = '#272D34';
const GREEN = '#A3E635';
const GRAY = '#9CA3AF';
const WHITE = '#FFFFFF';

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

// Shared ImageResponse options: fixed 1200x630 card + the cache header above.
const OG_OPTIONS = {
  width: 1200,
  height: 630,
  headers: { 'Cache-Control': CACHE_CONTROL },
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
 * project's plan. Non-Supabase URLs (the local /tribe-wordmark.png) pass
 * through unchanged.
 *
 * Width is clamped to MAX_TRANSFORM_WIDTH. Note the transform constrains WIDTH
 * only, not height: asking for 640 against a 1200x675 source returns 640x675,
 * not 640x360. That is fine for a background that gets scaled to cover.
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
 * THE MEASURED DEFECT IS ELSEWHERE, and this function does not address it: the
 * session card is 1,413,383 bytes and takes 5.3-11.2s to generate COLD against
 * 0.59s warm, because loadImage requests the session photo at width=1200 from a
 * source already 1200px wide (an 8% saving) and Satori then re-encodes that
 * photograph full-bleed as lossless PNG. A scraper's first fetch is always the
 * cold one. Dropping the image param alone takes the same card to 30,167 bytes
 * and 0.69s.
 *
 * Cost of buffering: the whole card is held in memory, 30KB-1.4MB by type.
 *
 * Tests: app/api/og/route.buffering.test.ts — which asserts the stream is
 * drained before returning, NOT that any header is set.
 */
async function bufferBody(res: Response): Promise<Response> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Copy the ImageResponse's own headers: content-type: image/png, plus the
  // Cache-Control from OG_OPTIONS. Both of these DO survive to the wire.
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
  const sport = searchParams.get('sport') ?? '';
  const date = searchParams.get('date') ?? '';
  const price = searchParams.get('price') ?? '';
  const instructor = searchParams.get('instructor') ?? '';
  const avatar = searchParams.get('avatar') ?? '';
  const spots = searchParams.get('spots') ?? '';
  const neighborhood = searchParams.get('neighborhood') ?? '';
  const image = searchParams.get('image') ?? '';

  // The real branded wordmark (white text + lime dot, for dark backgrounds).
  const logoUrl = `${new URL(request.url).origin}/tribe-wordmark.png`;

  if (type === 'session') {
    // Fetch the session photo, host avatar, and logo ONCE each, at display size,
    // as embeddable data URIs. Any that won't load come back '' so the render
    // can't blank out.
    //
    // The background is requested at 640/q60, not 1200/q75. It is painted
    // full-bleed and then scaled to cover a 1200x630 canvas UNDER a dark scrim
    // with text over it, so native resolution buys nothing visible at card
    // scale. Measured on a real session photo: 1200/q75 -> 211,606 bytes,
    // 640/q60 -> 90,757 bytes. The old 1200 request was close to a no-op
    // anyway, because session photos are commonly already 1200px wide.
    const [bg, av, logo] = await Promise.all([
      loadImage(image, 640, 60),
      loadImage(avatar, 104),
      loadImage(logoUrl, 152),
    ]);
    return renderSession({ title, sport, date, price, instructor, avatar: av, spots, neighborhood, image: bg, logo });
  }
  if (type === 'instructor') {
    const av = await loadImage(avatar, 280);
    return renderInstructor({ title: title || instructor, subtitle, avatar: av });
  }
  if (type === 'gym') {
    // Same param name as the instructor card ('avatar') so the loader and the
    // cache key stay one shape; the value is the gym's logo. 280px because the
    // square is drawn at 140 @2x, same as the instructor avatar.
    const logo = await loadImage(avatar, 280);
    return renderGym({ title: title || 'Gym', subtitle, logo });
  }
  if (type === 'achievement') {
    const emoji = searchParams.get('emoji') ?? '🏆';
    const userName = searchParams.get('userName') ?? '';
    return renderAchievement({ title, emoji, userName });
  }
  return renderDefault();
}

// ═══════════════════════════════════════════
// SESSION CARD
// ═══════════════════════════════════════════

interface SessionParams {
  title: string;
  sport: string;
  date: string;
  price: string;
  instructor: string;
  avatar: string;
  spots: string;
  neighborhood: string;
  /** Validated, loadable session photo URL. Empty = use the no-photo card. */
  image?: string;
  /** Validated, loadable branded wordmark URL. Empty = text fallback. */
  logo?: string;
}

function renderSession(p: SessionParams) {
  const sportLabel = p.sport.replace(/_/g, ' ');

  const detailItems: string[] = [];
  if (p.date) detailItems.push(p.date);
  if (p.neighborhood) detailItems.push(p.neighborhood);

  const wordmark = p.logo ? (
    <img src={p.logo} alt="" width={152} height={50} style={{ objectFit: 'contain' }} />
  ) : (
    <div style={{ display: 'flex', alignItems: 'baseline' }}>
      <span style={{ fontSize: '40px', fontWeight: 800, color: WHITE }}>Tribe</span>
      <span style={{ fontSize: '40px', fontWeight: 800, color: GREEN }}>.</span>
    </div>
  );

  const details = (detailItems.length > 0 || p.price) && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', fontSize: '24px', color: GRAY }}>
      {detailItems.map((item, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
          {i > 0 && <span style={{ marginRight: '20px', color: '#6B7280' }}>·</span>}
          {item}
        </span>
      ))}
      {p.price && (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {detailItems.length > 0 && <span style={{ marginRight: '20px', color: '#6B7280' }}>·</span>}
          <span style={{ color: GREEN, fontWeight: 700 }}>{p.price}</span>
        </span>
      )}
    </div>
  );

  const instructorRow = p.instructor ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '26px',
          backgroundColor: GREEN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {p.avatar ? (
          <img src={p.avatar} alt="" width={52} height={52} style={{ objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#1A1A1A' }}>
            {p.instructor[0]?.toUpperCase() || '?'}
          </span>
        )}
      </div>
      <span style={{ fontSize: '22px', fontWeight: 600, color: WHITE }}>{p.instructor}</span>
    </div>
  ) : null;

  // ── Photo mode: the host's session photo as a full-bleed background ──
  if (p.image) {
    return new ImageResponse(
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <img
          src={p.image}
          alt=""
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            background:
              'linear-gradient(to top, rgba(10,12,14,0.95) 0%, rgba(10,12,14,0.55) 45%, rgba(10,12,14,0.30) 100%)',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '50px 60px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {wordmark}
            {p.sport && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'rgba(163,230,53,0.22)',
                  padding: '10px 22px',
                  borderRadius: '24px',
                }}
              >
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: GREEN,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '1px',
                  }}
                >
                  {sportLabel}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: '60px',
                fontWeight: 800,
                color: WHITE,
                lineHeight: 1.1,
                maxWidth: '1040px',
                marginBottom: '20px',
              }}
            >
              {p.title || 'Training Session'}
            </div>
            {details && <div style={{ display: 'flex', marginBottom: '24px' }}>{details}</div>}
            {instructorRow}
          </div>
        </div>
      </div>,
      OG_OPTIONS
    );
  }

  // ── No-photo mode: make the activity big and obvious ──
  const showTitle = !!p.title && p.title.toLowerCase() !== sportLabel.toLowerCase();
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: DARK_BG,
        padding: '56px 60px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {wordmark}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
        {p.sport && (
          <span
            style={{
              fontSize: '88px',
              fontWeight: 800,
              color: GREEN,
              textTransform: 'uppercase' as const,
              letterSpacing: '2px',
              lineHeight: 1,
              marginBottom: showTitle ? '18px' : '6px',
            }}
          >
            {sportLabel}
          </span>
        )}
        {showTitle && (
          <div
            style={{
              fontSize: '44px',
              fontWeight: 700,
              color: WHITE,
              lineHeight: 1.15,
              maxWidth: '1040px',
              marginBottom: '18px',
            }}
          >
            {p.title}
          </div>
        )}
        {details}
      </div>
      {instructorRow && (
        <div style={{ display: 'flex', paddingTop: '24px', borderTop: '1px solid #374151' }}>{instructorRow}</div>
      )}
    </div>,
    OG_OPTIONS
  );
}

// ═══════════════════════════════════════════
// INSTRUCTOR CARD
// ═══════════════════════════════════════════

interface InstructorParams {
  title: string;
  subtitle: string;
  avatar: string;
}

function renderInstructor(p: InstructorParams) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK_BG,
        padding: '60px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Avatar with green ring */}
      <div
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '70px',
          border: `4px solid ${GREEN}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: '28px',
          backgroundColor: '#374151',
        }}
      >
        {p.avatar ? (
          <img src={p.avatar} alt="" width={140} height={140} style={{ objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '56px', fontWeight: 700, color: WHITE }}>{p.title[0]?.toUpperCase() || '?'}</span>
        )}
      </div>

      {/* Name */}
      <div style={{ fontSize: '48px', fontWeight: 700, color: WHITE, textAlign: 'center', marginBottom: '12px' }}>
        {p.title}
      </div>

      {/* Subtitle */}
      {p.subtitle && (
        <div style={{ fontSize: '24px', color: GRAY, textAlign: 'center', marginBottom: '40px', maxWidth: '700px' }}>
          {p.subtitle}
        </div>
      )}

      {/* Tribe branding */}
      <div style={{ display: 'flex', alignItems: 'baseline', position: 'absolute' as const, bottom: '40px' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: WHITE }}>Tribe</span>
        <span style={{ fontSize: '28px', fontWeight: 800, color: GREEN }}>.</span>
        <span style={{ fontSize: '16px', color: GRAY, marginLeft: '12px' }}>Never Train Alone</span>
      </div>
    </div>,
    OG_OPTIONS
  );
}

// ═══════════════════════════════════════════
// GYM CARD
// ═══════════════════════════════════════════

interface GymParams {
  title: string;
  subtitle: string;
  /** Validated, loadable logo URL. Empty = monogram fallback. */
  logo: string;
}

/**
 * The gym card for /g/[slug].
 *
 * Identical layout to the instructor card with ONE deliberate difference: the
 * image is a rounded square, not a circle. That contrast is the visual grammar
 * from T-GYM1 -- people are circles, organisations are rounded squares -- and a
 * link preview is the first time most people ever see a gym's identity on
 * Tribe, so it is the last place to harmonise it away.
 *
 * The fallback is a two-letter monogram rather than one initial, matching every
 * in-app gym surface. "CrossFit BullBox" reads as CB, not C.
 */
function renderGym(p: GymParams) {
  const monogram = p.title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK_BG,
        padding: '60px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Rounded SQUARE with a green ring — not the instructor circle. */}
      <div
        style={{
          width: '140px',
          height: '140px',
          borderRadius: '32px',
          border: `4px solid ${GREEN}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: '28px',
          backgroundColor: '#374151',
        }}
      >
        {p.logo ? (
          <img src={p.logo} alt="" width={140} height={140} style={{ objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: '52px', fontWeight: 700, color: GREEN }}>{monogram || '?'}</span>
        )}
      </div>

      <div style={{ fontSize: '48px', fontWeight: 700, color: WHITE, textAlign: 'center', marginBottom: '12px' }}>
        {p.title}
      </div>

      {p.subtitle && (
        <div style={{ fontSize: '24px', color: GRAY, textAlign: 'center', marginBottom: '40px', maxWidth: '700px' }}>
          {p.subtitle}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', position: 'absolute' as const, bottom: '40px' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: WHITE }}>Tribe</span>
        <span style={{ fontSize: '28px', fontWeight: 800, color: GREEN }}>.</span>
        <span style={{ fontSize: '16px', color: GRAY, marginLeft: '12px' }}>Never Train Alone</span>
      </div>
    </div>,
    OG_OPTIONS
  );
}

// ═══════════════════════════════════════════
// ACHIEVEMENT CARD
// ═══════════════════════════════════════════

interface AchievementParams {
  title: string;
  emoji: string;
  userName: string;
}

function renderAchievement(p: AchievementParams) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK_BG,
        padding: '60px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Emoji */}
      <div style={{ fontSize: '72px', marginBottom: '24px' }}>{p.emoji}</div>

      {/* Title */}
      <div
        style={{
          fontSize: '44px',
          fontWeight: 700,
          color: WHITE,
          textAlign: 'center',
          marginBottom: '16px',
          maxWidth: '800px',
        }}
      >
        {p.title}
      </div>

      {/* User name */}
      {p.userName && (
        <div style={{ fontSize: '24px', fontWeight: 600, color: GREEN, marginBottom: '40px' }}>{p.userName}</div>
      )}

      {/* Tribe branding */}
      <div style={{ display: 'flex', alignItems: 'baseline', position: 'absolute' as const, bottom: '40px' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: WHITE }}>Tribe</span>
        <span style={{ fontSize: '28px', fontWeight: 800, color: GREEN }}>.</span>
        <span style={{ fontSize: '16px', color: GRAY, marginLeft: '12px' }}>Never Train Alone</span>
      </div>
    </div>,
    OG_OPTIONS
  );
}

// ═══════════════════════════════════════════
// DEFAULT CARD
// ═══════════════════════════════════════════

function renderDefault() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK_BG,
        padding: '60px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: '24px' }}>
        <span style={{ fontSize: '80px', fontWeight: 800, color: WHITE }}>Tribe</span>
        <span style={{ fontSize: '80px', fontWeight: 800, color: GREEN }}>.</span>
      </div>
      <div style={{ fontSize: '28px', color: GRAY }}>Never Train Alone</div>
    </div>,
    OG_OPTIONS
  );
}
