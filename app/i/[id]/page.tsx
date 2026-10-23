import type { Metadata } from 'next';
import { coachCardVersion, coachGym, isListedCoach, loadCoach } from '@/lib/og/coachCard';
import { translateSport } from '@/lib/sportTranslationData';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import SiteLayout from '@/components/site/SiteLayout';
import CoachProfile from '@/components/site/pages/CoachProfile';
import { LANGUAGE_COOKIE, languageFromCookie } from '@/lib/languageCookie';
import { coachHeroPhoto, fetchCoachSessions } from '@/lib/site/coachPage';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { fetchWeekBoard } from '@/lib/site/week';
import { tickerLead } from '@/lib/site/weekBoard';
import { bogotaDateOffset } from '@/lib/time/bogotaDate';
import ViewTracker from './ViewTracker';
import SignedInTabBar from '@/components/site/SignedInTabBar';
import { SITE_URL } from '@/lib/http/siteUrl';
import { shareImageOrigin } from '@/lib/http/shareImageOrigin';
import { isMomentsEnabled } from '@/lib/features/moments';
import { loadCoachStrip } from '@/lib/moments/coachStrip';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { fetchCoachExtras } from '@/lib/site/publicProfileData';
import { siteT } from '@/lib/site/i18n';

const BASE_URL = SITE_URL;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  // Service role (lib/og/coachCard): the same row the card route draws, read
  // once, so the card's ?v= fingerprint and the card itself always agree.
  const instructor = await loadCoach(id);

  if (!instructor || !isListedCoach(instructor)) {
    return {
      title: 'Instructor no disponible | Tribe',
      description: 'Este perfil de instructor no está disponible en Tribe.',
    };
  }

  // Spanish sport names: a scraper sends no session and no language we act on,
  // and the market is Colombia. translateSport is the house helper CLAUDE.md
  // names; joining the raw enum values would print "Martial Arts" on a Spanish
  // card and "Weight_Training" with an underscore.
  const sportsLabel = instructor.sports?.length
    ? instructor.sports.map((sp: string) => translateSport(sp, 'es')).join(' · ')
    : 'Entrenamiento';

  // instructor_bio first, bio second: instructor_bio is the field both
  // instructor-facing editors write, so it matches the storefront. The bio
  // fallback keeps a description for instructors who only filled the older
  // general bio field.
  const ogName = instructor.name || 'Instructor';
  const storefrontBio = instructor.instructor_bio || instructor.bio;
  const description = storefrontBio
    ? storefrontBio.substring(0, 160)
    : [ogName, sportsLabel, 'Entrena con quien te hace mejor.'].filter(Boolean).join(' · ');

  // T-SHARE1 Part C: one page, two addresses. The handle when there is one.
  const slug = instructor.handle || instructor.id;
  const gym = await coachGym(instructor.id);
  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  // The card on a Vercel preview's own host there, tribelatam.com in production (shareImageOrigin).
  const ogImageUrl = `${shareImageOrigin()}/i/${slug}/card/?v=${coachCardVersion(instructor, gym)}`;
  const image = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: `Entrena con ${ogName} en Tribe`,
  };

  return {
    title: `${ogName} | Tribe`,
    description,
    openGraph: {
      title: `${ogName} en Tribe`,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/i/${slug}/`,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${ogName} en Tribe`,
      description,
      images: [ogImageUrl],
    },
  };
}

/**
 * Page: /i/<handle> or /i/<uuid>, a coach's own public page (T-SHARE1 Part E),
 * server-rendered in the site's frame and in the visitor's tribe_lang language.
 * Anything that is not a listed coach (an athlete, a banned or deleted account,
 * an unknown handle) is a 404.
 */
export default async function PublicInstructorPage({ params }: PageProps) {
  const { id } = await params;
  const coach = await loadCoach(id);
  if (!coach || !isListedCoach(coach)) notFound();

  const lang = languageFromCookie((await cookies()).get(LANGUAGE_COOKIE)?.value);
  const [gym, photo, sessions, board, momentos, extras] = await Promise.all([
    coachGym(coach.id),
    coachHeroPhoto(coach),
    fetchCoachSessions(coach.id),
    fetchWeekBoard(),
    // T-MOM1 Part D: the athletes' opted-in photos; a failure only drops the strip.
    isMomentsEnabled() ? loadCoachStrip(getServiceRoleClient(), coach.id, lang).catch(() => null) : null,
    // T-POLISH1 PR 3b-1: tagline, credentials, video, reviews, an independent coach's pass.
    fetchCoachExtras(coach.id, siteT(lang)('site.coachPage.athlete')),
  ]);

  return (
    <SiteLayout
      lang={lang}
      lead={tickerLead(board, lang)}
      fontClassName={SITE_FONT_CLASS}
      // T-POLISH1 PR 3b-2: the app's tab bar for a signed-in viewer (client-side only).
      afterFooter={<SignedInTabBar spacer />}
      hideDownloadWhenSignedIn
    >
      <ViewTracker coachId={coach.id} />
      <CoachProfile
        lang={lang}
        coach={{
          name: coach.name,
          sports: coach.sports,
          bio: coach.instructor_bio || coach.bio,
          specialties: coach.specialties ?? null,
        }}
        gym={gym}
        photo={photo}
        sessions={sessions}
        weekEnd={bogotaDateOffset(6)}
        momentos={momentos}
        coachId={coach.id}
        pagePath={`/i/${coach.handle || coach.id}/`}
        extras={extras}
      />
    </SiteLayout>
  );
}
