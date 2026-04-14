import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

const SPORT_EMOJI: Record<string, string> = {
  running: '🏃',
  cycling: '🚴',
  swimming: '🏊',
  yoga: '🧘',
  crossfit: '🏋️',
  tennis: '🎾',
  basketball: '🏀',
  soccer: '⚽',
  hiking: '🥾',
  boxing: '🥊',
  hiit: '🔥',
  pilates: '🧘‍♀️',
  functional: '💪',
  dance: '💃',
  martial_arts: '🥋',
};

const DARK_BG = '#272D34';
const GREEN = '#A3E635';
const GRAY = '#9CA3AF';
const WHITE = '#FFFFFF';

const SPORT_IMAGE_SLUGS = new Set([
  'running',
  'yoga',
  'crossfit',
  'cycling',
  'swimming',
  'boxing',
  'pilates',
  'hiking',
  'basketball',
  'soccer',
  'tennis',
  'martial_arts',
  'dance',
  'strength',
  'functional',
  'calisthenics',
]);

function buildHeroImageUrl(req: NextRequest, sport: string): string | null {
  try {
    const origin = new URL(req.url).origin;
    const slug = sport.toLowerCase();
    if (SPORT_IMAGE_SLUGS.has(slug)) {
      return `${origin}/images/sports/${slug}.jpg`;
    }
    return `${origin}/images/sports/default.jpg`;
  } catch {
    return null;
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

  if (type === 'session') {
    const heroImageUrl = sport ? buildHeroImageUrl(request, sport) : null;
    return renderSession({ title, sport, date, price, instructor, avatar, spots, neighborhood, heroImageUrl });
  }
  if (type === 'instructor') {
    return renderInstructor({ title: title || instructor, subtitle, avatar });
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
  heroImageUrl?: string | null;
}

function renderSession(p: SessionParams) {
  const sportEmoji = SPORT_EMOJI[p.sport.toLowerCase()] ?? '💪';
  const detailItems: string[] = [];
  if (p.date) detailItems.push(p.date);
  if (p.neighborhood) detailItems.push(p.neighborhood);
  const spotsText = p.spots ? `${p.spots} spots left` : '';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: DARK_BG,
        padding: '50px 60px',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
      }}
    >
      {p.heroImageUrl && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.heroImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.2) 100%)',
            }}
          />
        </div>
      )}
      {/* Top row: logo + sport tag */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '40px',
          zIndex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: '40px', fontWeight: 800, color: WHITE }}>Tribe</span>
          <span style={{ fontSize: '40px', fontWeight: 800, color: GREEN }}>.</span>
        </div>
        {p.sport && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(163,230,53,0.15)',
              padding: '8px 20px',
              borderRadius: '24px',
            }}
          >
            <span style={{ fontSize: '22px' }}>{sportEmoji}</span>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: GREEN,
                textTransform: 'uppercase' as const,
                letterSpacing: '1px',
              }}
            >
              {p.sport}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: '52px',
          fontWeight: 700,
          color: WHITE,
          lineHeight: 1.15,
          maxWidth: '950px',
          marginBottom: '28px',
        }}
      >
        {p.title || 'Training Session'}
      </div>

      {/* Details row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          fontSize: '22px',
          color: GRAY,
          marginBottom: 'auto',
        }}
      >
        {detailItems.map((item, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span style={{ marginRight: '24px', color: '#4B5563' }}>·</span>}
            {item}
          </span>
        ))}
        {p.price && (
          <span style={{ display: 'flex', alignItems: 'center' }}>
            {detailItems.length > 0 && <span style={{ marginRight: '24px', color: '#4B5563' }}>·</span>}
            <span style={{ color: GREEN, fontWeight: 700 }}>{p.price}</span>
          </span>
        )}
        {spotsText && (
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: '24px', color: '#4B5563' }}>·</span>
            {spotsText}
          </span>
        )}
      </div>

      {/* Instructor row at bottom */}
      {p.instructor && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            paddingTop: '24px',
            borderTop: '1px solid #374151',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '24px',
              backgroundColor: GREEN,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {p.avatar ? (
              <img src={p.avatar} width={48} height={48} style={{ objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '20px', fontWeight: 700, color: '#1A1A1A' }}>
                {p.instructor[0]?.toUpperCase() || '?'}
              </span>
            )}
          </div>
          <span style={{ fontSize: '20px', fontWeight: 600, color: WHITE }}>{p.instructor}</span>
        </div>
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
          <img src={p.avatar} width={140} height={140} style={{ objectFit: 'cover' }} />
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
