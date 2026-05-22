import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const DARK_BG = '#272D34';
const GREEN = '#A3E635';
const GRAY = '#9CA3AF';
const WHITE = '#FFFFFF';

/**
 * Confirm a URL actually resolves to an image before we hand it to Satori.
 * Satori fetches <img> sources itself and throws the WHOLE render if any one
 * 404s/times out — which silently produces a 0-byte image (the blank-card bug
 * we hit with the old /images/sports hero). Pre-validating means a dead photo
 * or avatar URL just falls back to a clean layout instead of breaking.
 */
async function imageLoads(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return false;
    return (res.headers.get('content-type') ?? '').startsWith('image/');
  } catch {
    return false;
  }
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
    // Validate the session photo, host avatar, and logo in parallel; drop any
    // that won't load so the render can't blank out.
    const [bg, av, logo] = await Promise.all([
      image ? imageLoads(image).then((ok) => (ok ? image : '')) : Promise.resolve(''),
      avatar ? imageLoads(avatar).then((ok) => (ok ? avatar : '')) : Promise.resolve(''),
      imageLoads(logoUrl).then((ok) => (ok ? logoUrl : '')),
    ]);
    return renderSession({ title, sport, date, price, instructor, avatar: av, spots, neighborhood, image: bg, logo });
  }
  if (type === 'instructor') {
    const av = avatar && (await imageLoads(avatar)) ? avatar : '';
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
      { width: 1200, height: 630 }
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
    { width: 1200, height: 630 }
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
    { width: 1200, height: 630 }
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
    { width: 1200, height: 630 }
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
    { width: 1200, height: 630 }
  );
}
