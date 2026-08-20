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
 * Rewrite a Supabase public-object URL to the render/image transform endpoint
 * so we fetch a DISPLAY-SIZED jpeg instead of the full-resolution original
 * (e.g. a 1638px, 132KB avatar drawn as a 52px dot). Verified available on this
 * project's plan. Non-Supabase URLs (the local /tribe-wordmark.png) pass
 * through unchanged.
 */
function toTransformUrl(url: string, width: number, quality = 75): string {
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}`;
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
async function loadImage(rawUrl: string, width: number): Promise<string> {
  if (!rawUrl) return '';
  const transformed = toTransformUrl(rawUrl, width);
  const resized = await fetchAsDataUri(transformed);
  if (resized) return resized;
  return transformed === rawUrl ? '' : fetchAsDataUri(rawUrl);
}

export async function GET(request: NextRequest) {
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
    // can't blank out. Photo full-bleed at 1200px; avatar 104px (52 @2x).
    const [bg, av, logo] = await Promise.all([loadImage(image, 1200), loadImage(avatar, 104), loadImage(logoUrl, 152)]);
    return renderSession({ title, sport, date, price, instructor, avatar: av, spots, neighborhood, image: bg, logo });
  }
  if (type === 'instructor') {
    const av = await loadImage(avatar, 280);
    return renderInstructor({ title: title || instructor, subtitle, avatar: av });
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
