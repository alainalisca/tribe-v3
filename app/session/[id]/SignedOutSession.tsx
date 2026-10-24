'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { FactsLedger, type Fact } from '@/components/bridge';
import br from '@/components/bridge/bridge.module.css';
import { insertGuestParticipant, removeGuestParticipant, storeGuestLocally } from '@/hooks/sessionActionHelpers';
import { trackEvent } from '@/lib/analytics';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { pageWhen, publicSessionPlace } from '@/lib/share/sessionPublic';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { useMarkMarketingSurface } from '@/lib/site/marketingSurface';
import { isOptimizableImage } from '@/lib/site/imageHosts';
import { usableAvatarUrl } from '@/lib/avatarSrc';
import { translateSport } from '@/lib/sportTranslationData';
import { createClient } from '@/lib/supabase/client';
import type { Session } from '@/lib/database.types';
import GuestJoinModal from './GuestJoinModal';
import SessionPoster, { sessionPriceLabel } from './SessionPoster';
import CoachPlanBadge from '@/components/CoachPlanBadge';
import s from './signedOut.module.css';

/**
 * T-JOIN1 Part B: the session page for someone not signed in, which is where
 * every share link now lands (/s/<id> redirects here). The Jornada frame on
 * paper: PosterHeader, the coach, the facts (Cuándo, Dónde, Cuánto, Quién),
 * the description, and a sticky bar with one lime button.
 *
 *   free session  "Pedir mi cupo": name and WhatsApp, through the guest route
 *   paid session  "Entrar para pedir cupo": sign in, then back to this session
 *                 (T-PAY3 decision 1: paid needs an account)
 *
 * After a request the button turns ink with a lime "Pedido ✓", the guest's
 * initials join the stack, and a toast offers "Deshacer" for 8 seconds (the
 * guest-leave RPC, with the token the join returned).
 *
 * Never the street address: Dónde is the partner gym and the barrio
 * (lib/share/sessionPublic.ts), the same words as the share card.
 */
export type PublicSession = {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  duration: number | null;
  description: string | null;
  photos: string[] | null;
  max_participants: number;
  current_participants: number;
  status: string | null;
  is_paid: boolean | null;
  price_cents: number | null;
  currency: string | null;
  creator_id: string | null;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  partner_status: string | null;
};

const UNDO_MS = 8000;
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('es') ?? '')
    .join('');

export default function SignedOutSession({
  session,
  creator,
  gymName,
  language,
  isPast,
  isFull,
  place: placeOverride,
  photo = null,
}: {
  session: PublicSession;
  /** coach_plan: T-PLAN1's badge, only while COACH_PLANS_ENABLED. */
  creator: { id: string; name: string | null; avatar_url: string | null; coach_plan?: string | null } | null;
  /** The partner gym's name when the session is at an approved, active partner. */
  gymName: string | null;
  language: 'es' | 'en';
  isPast: boolean;
  isFull: boolean;
  /**
   * T-SSR1: the place already worked out on the server, so a server render
   * never hands the street address (session.location) to the browser. Absent
   * when the page renders in the browser, which works it out here.
   */
  place?: { place: string | null; barrio: string | null };
  /**
   * The hero photo: the host's coach-card photo, the same chain as the
   * WhatsApp card and the signed-in page (lib/session/publicSession
   * hostHeroFor). Null for the poster with no photo; never the session's own
   * photos.
   */
  photo?: { url: string; x: number; y: number } | null;
}) {
  const t = useTranslations('sessionPublic');
  // The Jornada frame: the app's feedback bubble and install banner stay off it,
  // so the sticky bar's button is the only call to action.
  useMarkMarketingSurface();
  const [showModal, setShowModal] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ name: string; participantId: string } | null>(null);
  const [going, setGoing] = useState(session.current_participants ?? 0);

  // A guest who asked before (this browser) sees their request, not the button.
  useEffect(() => {
    try {
      const token = localStorage.getItem(`guest_token_${session.id}`);
      const name = localStorage.getItem(`guest_name_${session.id}`);
      if (token && name) setMine({ name, participantId: '' });
    } catch {
      // Storage blocked: the page still works, the request just is not remembered.
    }
  }, [session.id]);

  const coachName = creator?.name?.trim() || '';
  const hostFirst = coachName.split(/\s+/)[0] || t('coachFallback');
  const sport = session.sport && session.sport !== 'Other' ? translateSport(session.sport, language) : null;
  const { place, barrio } =
    placeOverride ??
    publicSessionPlace({
      partnerName: gymName,
      partnerApproved: session.partner_status === 'approved' && !!gymName,
      lat: session.location_lat,
      lng: session.location_lng,
      location: session.location,
    });
  const paid = !!session.is_paid && (session.price_cents ?? 0) > 0;
  const price = sessionPriceLabel(session, language);
  const spotsLeft = Math.max(0, (session.max_participants ?? 0) - going);
  const returnTo = `/session/${session.id}/`;
  const signInHref = `/auth/?returnTo=${encodeURIComponent(returnTo)}`;
  const mapsHref =
    session.location_lat != null && session.location_lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${session.location_lat},${session.location_lng}`
      : null;

  async function ask(name: string, phone: string) {
    setJoining(true);
    setError(null);
    try {
      const data = await insertGuestParticipant(createClient(), session as unknown as Session, {
        name,
        phone,
        email: '',
      });
      storeGuestLocally(session.id, { name, phone, email: '' }, data.guest_token);
      try {
        localStorage.setItem(`guest_name_${session.id}`, name);
      } catch {
        // Storage blocked: fine.
      }
      trackEvent('session_joined', {
        session_id: session.id,
        sport: session.sport,
        is_paid: false,
        instructor_id: session.creator_id,
        is_first_join: null,
        session_type: 'free',
      });
      setMine({ name, participantId: data.id });
      setGoing((n) => n + 1);
      setShowModal(false);
      showUndoToast();
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(
        code === 'already_joined'
          ? t('alreadyJoined')
          : code === 'rate_limited'
            ? t('rateLimited')
            : code === 'SESSION_FULL'
              ? t('sessionFull')
              : code === 'invalid_phone'
                ? t('phoneInvalid')
                : t('joinFailed')
      );
    } finally {
      setJoining(false);
    }
  }

  function showUndoToast() {
    toast.custom(
      (tt) => (
        <div className={`${br.bridge} ${SITE_FONT_CLASS} ${s.toast}`} role="status">
          <span>{t('toast', { name: hostFirst })}</span>
          <button
            type="button"
            className={s.undo}
            onClick={async () => {
              toast.dismiss(tt.id);
              try {
                const ok = await removeGuestParticipant(
                  createClient(),
                  session as unknown as Session,
                  session.id,
                  language
                );
                if (!ok) return;
                try {
                  localStorage.removeItem(`guest_name_${session.id}`);
                } catch {
                  // fine
                }
                setMine(null);
                setGoing((n) => Math.max(0, n - 1));
                toast(t('undone'), { duration: 3000 });
              } catch {
                toast(t('undoFailed'), { duration: 3000 });
              }
            }}
          >
            {t('undo')}
          </button>
        </div>
      ),
      // Top: at the bottom it would cover the sticky bar's "Pedido ✓".
      { duration: UNDO_MS, position: 'top-center' }
    );
  }

  const facts: Fact[] = [
    {
      label: t('when'),
      value: pageWhen(session.date, session.start_time, language),
      sub: session.duration ? t('minutes', { n: session.duration }) : undefined,
    },
    {
      label: t('where'),
      value: place ?? t('placeNone'),
      sub: (
        <>
          {barrio && <>{barrio} · </>}
          {mapsHref && (
            <a className={s.directions} href={mapsHref} target="_blank" rel="noopener noreferrer">
              {t('directions')}
            </a>
          )}
        </>
      ),
    },
    {
      label: t('cost'),
      value: price ? <span className={s.priceMono}>{price}</span> : t('free'),
      sub: t('direct', { name: hostFirst }),
    },
    {
      label: t('who'),
      value: (
        <span className={s.who}>
          {(going > 0 || mine) && (
            <span className={s.stack} aria-hidden="true">
              {Array.from({ length: Math.min(4, Math.max(0, going - (mine ? 1 : 0))) }, (_, i) => (
                <span key={i} className={s.disc} />
              ))}
              {mine && <span className={s.me}>{initials(mine.name)}</span>}
            </span>
          )}
          <span>{going === 0 ? t('goingNone') : going === 1 ? t('goingOne') : t('going', { n: going })}</span>
          {session.max_participants > 0 && !isPast && (
            <span className={s.chip}>{spotsLeft === 1 ? t('spotsOne') : t('spots', { n: spotsLeft })}</span>
          )}
        </span>
      ),
    },
  ];

  let action: React.ReactNode;
  // T-JOIN1b: a cancelled session says so, offers nothing to book, and points
  // at the host's coach page instead.
  if (session.status === 'cancelled')
    action = (
      <div className={s.cancelledBar} role="status">
        <span className={s.cancelledText}>{t('cancelledNotice')}</span>
        {creator && (
          <Link className={s.cancelledLink} href={`/i/${creator.id}/`}>
            {t('coachLink', { name: hostFirst })}
          </Link>
        )}
      </div>
    );
  else if (isPast) action = <span className={s.inert}>{t('ended')}</span>;
  else if (mine) action = <span className={s.done}>{t('requested')}</span>;
  else if (paid)
    action = (
      <a className={s.limeButton} href={signInHref}>
        {t('signInToAsk')}
      </a>
    );
  else if (isFull) action = <span className={s.inert}>{t('full')}</span>;
  else
    action = (
      <button type="button" className={s.limeButton} onClick={() => setShowModal(true)}>
        {t('ask')}
      </button>
    );

  const avatarOk = isOptimizableImage(creator?.avatar_url) && !!usableAvatarUrl(creator?.avatar_url);

  return (
    <div className={`${br.bridge} ${SITE_FONT_CLASS} ${s.page}`}>
      <div className={s.top}>
        <Link href="/" aria-label="Tribe">
          {/* The ink wordmark on paper, in either theme. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tribe-wordmark-dark.png" alt="Tribe" style={{ height: 22, width: 'auto' }} />
        </Link>
      </div>
      <div className={s.column}>
        <SessionPoster
          session={session}
          creatorName={coachName}
          gymName={gymName}
          language={language}
          place={placeOverride?.place}
          photo={photo}
        />
        <div className={s.body}>
          {creator && (
            <Link className={s.coach} href={`/i/${creator.id}/`}>
              <span className={s.avatar}>
                {avatarOk ? <Image src={creator.avatar_url!} alt="" fill sizes="44px" /> : initials(coachName || 'T')}
              </span>
              <span>
                <span className={s.coachName}>{coachName}</span> <CoachPlanBadge plan={creator.coach_plan} />
                {sport && <span className={`${br.mono} ${s.coachSport}`}>{sport}</span>}
              </span>
              <span className={s.coachGo}>{t('coachProfile')}</span>
            </Link>
          )}
          <FactsLedger facts={facts} />
          {session.description?.trim() && (
            <section>
              <h2 className={`${br.mono} ${s.sectionLabel}`}>{t('about')}</h2>
              <p className={s.description}>{session.description.trim()}</p>
            </section>
          )}
        </div>
      </div>
      <div className={s.bar}>
        <div className={s.barInner}>{action}</div>
      </div>
      {showModal && (
        <GuestJoinModal
          hostName={hostFirst}
          joining={joining}
          error={error}
          signInHref={signInHref}
          onClose={() => {
            setShowModal(false);
            setError(null);
          }}
          onSubmit={ask}
        />
      )}
    </div>
  );
}
