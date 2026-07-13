'use client';

import Link from 'next/link';
import { Share2, CalendarCheck, MessageCircle } from 'lucide-react';
import { getInstructorShareUrl, copyToClipboard } from '@/lib/share';
import { showSuccess } from '@/lib/toast';
import CredentialsBadges from '@/components/instructor/CredentialsBadges';
import VideoIntro from '@/components/instructor/VideoIntro';
import AvailabilityPreview from '@/components/instructor/AvailabilityPreview';
import InterestButton from '@/components/instructor/InterestButton';
import TipButton from '@/components/TipButton';
import PartnerStorefrontBadge from '@/components/storefront/PartnerStorefrontBadge';
import PartnerInstructorRoster from '@/components/storefront/PartnerInstructorRoster';
import type { Instructor, FollowState } from '@/app/storefront/[id]/useStorefrontData';
import type { FeaturedPartner, PartnerInstructor } from '@/lib/dal/featuredPartners';

interface StorefrontProfileColumnProps {
  instructor: Instructor;
  lang: 'en' | 'es';
  instructorId: string;
  currentUserId: string | null;
  isOwn: boolean;
  isAthleteViewer: boolean;
  partnerData: FeaturedPartner | null;
  partnerInstructors: PartnerInstructor[];
  followState: FollowState;
  onFollowToggle: () => void;
  canBook: boolean;
  onBook: () => void;
}

/** Profile/sidebar column — bio, credentials, video, availability, the
 *  Interested/Tip/Follow actions, share, partner roster, and the
 *  desktop Book CTA. Theme tokens only. */
export default function StorefrontProfileColumn(props: StorefrontProfileColumnProps) {
  const {
    instructor,
    lang,
    instructorId,
    currentUserId,
    isOwn,
    isAthleteViewer,
    partnerData,
    partnerInstructors,
    followState,
    onFollowToggle,
    canBook,
    onBook,
  } = props;

  return (
    <div className="space-y-4">
      {partnerData && <PartnerStorefrontBadge partner={partnerData} language={lang} />}
      {instructor.bio && (
        <div className="bg-theme-card rounded-2xl p-4 border border-theme">
          <p className="text-theme-secondary text-sm leading-relaxed">{instructor.bio}</p>
        </div>
      )}
      <CredentialsBadges
        certifications={instructor.certifications || []}
        isVerified={!!instructor.verified}
        yearsExperience={instructor.years_experience || 0}
        language={lang}
      />
      <VideoIntro
        videoUrl={instructor.storefront_video_url}
        posterUrl={instructor.storefront_banner_url}
        isOwnStorefront={isOwn}
        language={lang}
      />
      <AvailabilityPreview instructorId={instructorId} language={lang} />
      {isAthleteViewer && (
        // T-DM Gate 2: instructors are publicly soliciting business, so an athlete
        // can message them directly from a cold storefront — no connection needed.
        // Opens /messages?user=, which creates the DM via the get_or_create_direct_
        // conversation RPC. "Estoy Interesado" below stays as a separate lead flow.
        <Link
          href={`/messages?user=${instructorId}`}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm bg-tribe-green text-slate-900 hover:opacity-90 transition-all"
        >
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          {lang === 'es' ? 'Enviar mensaje' : 'Message'}
        </Link>
      )}
      {isAthleteViewer && (
        <InterestButton
          athleteId={currentUserId!}
          instructorId={instructorId}
          instructorName={instructor.name}
          specialties={instructor.specialties || []}
          language={lang}
        />
      )}
      {isAthleteViewer && (
        <TipButton
          tipperId={currentUserId!}
          instructorId={instructorId}
          instructorName={instructor.name}
          currency={lang === 'en' ? 'USD' : 'COP'}
          language={lang}
        />
      )}
      <button
        onClick={onFollowToggle}
        className={`w-full px-3 py-2 rounded-xl font-semibold transition-all text-sm ${
          followState.isFollowing
            ? 'bg-tribe-green/20 text-tribe-green border border-tribe-green'
            : 'bg-tribe-green text-slate-900 hover:opacity-90'
        }`}
      >
        {followState.isFollowing ? (lang === 'es' ? 'Siguiendo' : 'Following') : lang === 'es' ? 'Seguir' : 'Follow'}
      </button>
      {!isOwn && (
        <p className="-mt-1 px-1 text-xs text-theme-tertiary">
          {lang === 'es'
            ? 'Síguelo para ver sus publicaciones y nuevas sesiones en tu feed.'
            : 'Follow to see their posts and new sessions in your feed.'}
        </p>
      )}
      {isOwn && (
        <button
          onClick={async () => {
            const copied = await copyToClipboard(getInstructorShareUrl(instructorId));
            if (copied) showSuccess(lang === 'es' ? 'Enlace de perfil copiado!' : 'Profile link copied!');
          }}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold bg-theme-surface text-theme-secondary hover:text-theme-primary border border-theme transition-colors"
        >
          <Share2 className="w-4 h-4" />
          {lang === 'es' ? 'Compartir Perfil' : 'Share Profile'}
        </button>
      )}
      {partnerData && partnerInstructors.length > 0 && (
        <PartnerInstructorRoster instructors={partnerInstructors} language={lang} />
      )}
      {canBook && (
        <button
          onClick={onBook}
          className="hidden lg:flex w-full items-center justify-center gap-2 py-3 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm hover:opacity-90 transition"
        >
          <CalendarCheck className="w-4 h-4" />
          {lang === 'es' ? 'Reservar una sesión' : 'Book a session'}
        </button>
      )}
    </div>
  );
}
