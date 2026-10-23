import Image from 'next/image';
import { coachFirstName, coachSports } from '@/lib/og/coachCard';
import type { HeroPhoto } from '@/lib/site/coachPage';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import type { WeekRow } from '@/lib/site/weekTypes';
import { fixtureFromWeekRow, fixtureLabels } from '@/lib/site/fixture';
import FixtureRow from '../FixtureRow';
import CoachMomentsStrip from '../CoachMomentsStrip';
import type { StripTile } from '@/lib/moments/coachStrip';
import type { CoachExtras } from '@/lib/site/publicProfileData';
import PublicProfileActions from '../PublicProfileActions';
import PublicPassLink from '../PublicPassLink';
import VideoIntro from '@/components/instructor/VideoIntro';
import a from '../publicProfileActions.module.css';
import b from '../base.module.css';
import w from '../week.module.css';
import c from './coach.module.css';

/**
 * T-SHARE1 Part E: the public coach page, /i/<handle>, in the Jornada frame so
 * it matches the coach's share card. The card's photo (the same pick and the
 * same crop centre, at 4:5 on a phone and 16:9 on a desktop), or the card's
 * initials block; the name with the round lime dot; sport and gym (or
 * Medellín) in mono. Then the coach's upcoming sessions as the board's rows,
 * each with one "Reserva" that opens the session page, or the ink block when
 * there are none. Then "Momentos" (T-MOM1 Part D) when the page has a strip,
 * then the bio and specialties.
 *
 * T-POLISH1 PR 3b-1 brings the storefront over: the tagline under the name;
 * Enviar mensaje / Seguir / Estoy interesado / Bloquear-Reportar as one client
 * island (signed-out links in the server HTML, the live controls after
 * hydration); an independent coach's free-class pass; the intro video; the
 * credentials; and the reviews, with names as "María G." and a star average
 * only from MIN_REVIEWS_FOR_RATING reviews up. Not the trust bar (its counters
 * stopped updating with migration 225) and not posts or likes.
 *
 * No session count anywhere, no round avatar, never a logo as the hero (the
 * hero is only ever the card's photo, which skips anything in
 * card_photo_rejects and anything not in Tribe storage).
 */
export type CoachProfileData = {
  name: string | null;
  sports: string[] | null;
  bio: string | null;
  specialties: string[] | null;
};

/** Longer than this, a specialty is shown as a line of text, not a mono chip. */
const CHIP_MAX = 28;

/** A session past this week shows its date, short: "4 nov" (ES), "Nov 4" (EN). */
function dateLabel(date: string, lang: SiteLanguage): string {
  const d = new Date(`${date}T12:00:00Z`);
  const month = d
    .toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { month: 'short', timeZone: 'UTC' })
    .replace('.', '');
  return lang === 'en' ? `${month} ${d.getUTCDate()}` : `${d.getUTCDate()} ${month}`;
}

/** A review's date, short: "4 nov 2026" (ES), "Nov 4, 2026" (EN). */
function reviewDate(iso: string, lang: SiteLanguage): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

function Stars({ value, alt }: { value: number; alt: string }) {
  const full = Math.round(value);
  return (
    <span className={c.stars} role="img" aria-label={alt}>
      {'★'.repeat(full)}
      <span className={c.starsOff}>{'★'.repeat(5 - full)}</span>
    </span>
  );
}

export default function CoachProfile({
  lang,
  coach,
  gym,
  photo,
  sessions,
  weekEnd,
  momentos = null,
  coachId,
  pagePath,
  extras = null,
}: {
  lang: SiteLanguage;
  coach: CoachProfileData;
  gym: string | null;
  photo: HeroPhoto | null;
  sessions: WeekRow[];
  /** The last day of this week (Bogotá); later sessions show their date. */
  weekEnd: string;
  /** T-MOM1 Part D: the athletes' opted-in photos; null when there are too few to show. */
  momentos?: StripTile[] | null;
  /** T-POLISH1 PR 3b-1: the account the actions act on, and this page's path for sign-in's returnTo. */
  coachId?: string;
  pagePath?: string;
  /** T-POLISH1 PR 3b-1: what the page brings over from the storefront. */
  extras?: CoachExtras | null;
}) {
  const t = siteT(lang);
  const name = (coach.name ?? '').trim() || 'Tribe';
  const first = coachFirstName(coach.name);
  const sports = coachSports(coach.sports, lang).join(' · ') || t('site.coachPage.coach');
  const specialties = (coach.specialties ?? []).map((s) => s.trim()).filter(Boolean);
  // A specialty is a chip when it is a few words; a sentence reads as a line.
  const chips = specialties.filter((s) => s.length <= CHIP_MAX);
  const lines = specialties.filter((s) => s.length > CHIP_MAX);

  return (
    <>
      <section className={c.hero} aria-labelledby="coach-name">
        <div className={c.photo}>
          {photo ? (
            <Image
              src={photo.url}
              alt={t('site.coachPage.photoAlt', { name: first })}
              fill
              preload
              fetchPriority="high"
              sizes="100vw"
              style={{ objectPosition: `${photo.x}% ${photo.y}%` }}
            />
          ) : (
            <div className={c.initials} aria-hidden="true">
              <span>{first.slice(0, 1)}</span>
            </div>
          )}
        </div>
        <div className={`${b.g} ${c.head}`}>
          <h1 id="coach-name" className={`${b.disp} ${c.name}`}>
            {name}
            <span className={c.dot} aria-hidden="true" />
          </h1>
          <p className={`${b.mono} ${c.meta}`}>
            {sports} · {gym || t('site.coachPage.city')}
          </p>
          {extras?.tagline && <p className={c.tagline}>{extras.tagline}</p>}
        </div>
      </section>

      <div className={c.body}>
        {coachId && pagePath && (
          <section className={`${b.g} ${c.block}`} aria-label={t('site.coachPage.message')}>
            <PublicProfileActions
              targetId={coachId}
              targetName={first}
              pagePath={pagePath}
              showInterest
              specialties={coach.sports ?? []}
              language={lang}
              variant="site"
              labels={{
                message: t('site.coachPage.message'),
                follow: t('site.coachPage.follow'),
                following: t('site.coachPage.following'),
                interested: t('site.coachPage.interested'),
              }}
            />
            {extras?.pass && (
              <div className={c.passWrap}>
                <PublicPassLink
                  slug={extras.pass.slug}
                  label={t('site.coachPage.pass')}
                  sub={t('site.coachPage.passSub', { name: first })}
                  surface="coach_page"
                  className={a.pass}
                  subClassName={a.passSub}
                />
              </div>
            )}
          </section>
        )}

        <section className={`${b.g} ${c.block}`} aria-labelledby="coach-sessions">
          <h2 id="coach-sessions" className={`${b.mono} ${c.label}`}>
            {t('site.coachPage.upcoming')}
          </h2>
          {sessions.length > 0 ? (
            <ul className={`${w.table} ${w.paper}`}>
              {sessions.map((r) => (
                <FixtureRow
                  key={r.id}
                  fixture={fixtureFromWeekRow(r, lang, {
                    days: r.date > weekEnd ? dateLabel(r.date, lang) : undefined,
                  })}
                  labels={fixtureLabels(lang, t('site.coachPage.book'))}
                />
              ))}
            </ul>
          ) : (
            <p className={c.empty}>{t('site.coachPage.none')}</p>
          )}
        </section>

        {extras?.videoUrl && (
          <section className={`${b.g} ${c.block}`} aria-labelledby="coach-video">
            <h2 id="coach-video" className={`${b.mono} ${c.label}`}>
              {t('site.coachPage.video')}
            </h2>
            <VideoIntro videoUrl={extras.videoUrl} posterUrl={extras.videoPoster} language={lang} />
          </section>
        )}

        {momentos && momentos.length > 0 && (
          <section className={`${b.g} ${c.block}`} aria-labelledby="coach-momentos">
            <h2 id="coach-momentos" className={`${b.mono} ${c.label}`}>
              {t('site.coachPage.momentos')}
            </h2>
            <CoachMomentsStrip
              tiles={momentos}
              labels={{
                close: t('site.coachPage.momentosClose'),
                photoOf: t('site.coachPage.momentosPhotoOf'),
                open: t('site.coachPage.momentosOpen'),
              }}
            />
          </section>
        )}

        {(coach.bio || specialties.length > 0 || (extras && (extras.verified || extras.certifications.length > 0))) && (
          <section className={`${b.g} ${c.block}`} aria-labelledby="coach-about">
            <h2 id="coach-about" className={`${b.mono} ${c.label}`}>
              {t('site.coachPage.about', { name: first })}
            </h2>
            {coach.bio && <p className={c.bio}>{coach.bio}</p>}
            {specialties.length > 0 && (
              <>
                <h3 className={`${b.mono} ${c.sub}`}>{t('site.coachPage.specialties')}</h3>
                {chips.length > 0 && (
                  <ul className={c.chips}>
                    {chips.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
                {lines.length > 0 && (
                  <ul className={c.lines}>
                    {lines.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {extras && (extras.verified || extras.certifications.length > 0) && (
              <>
                <h3 className={`${b.mono} ${c.sub}`}>{t('site.coachPage.credentials')}</h3>
                {extras.verified && <p className={c.verified}>✓ {t('site.coachPage.verified')}</p>}
                {extras.certifications.length > 0 && (
                  <ul className={c.lines}>
                    {extras.certifications.map((cert) => (
                      <li key={cert}>{cert}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )}

        {extras && extras.reviews.count > 0 && (
          <section className={`${b.g} ${c.block}`} aria-labelledby="coach-reviews" data-testid="coach-reviews">
            <h2 id="coach-reviews" className={`${b.mono} ${c.label}`}>
              {t('site.coachPage.reviews')}
            </h2>
            <p className={c.reviewsHead}>
              {extras.reviews.rating !== null && (
                <>
                  <span className={c.ratingNum}>{extras.reviews.rating.toFixed(1)}</span>{' '}
                  <span className={c.ratingOf}>{t('site.coachPage.outOf')}</span>{' '}
                  <Stars
                    value={extras.reviews.rating}
                    alt={t('site.coachPage.starsAlt', { n: extras.reviews.rating.toFixed(1) })}
                  />{' '}
                </>
              )}
              <span className={c.ratingOf}>
                {extras.reviews.count === 1
                  ? t('site.coachPage.reviewsOne')
                  : t('site.coachPage.reviewsCount', { n: extras.reviews.count })}
              </span>
            </p>
            <ul className={c.reviews}>
              {extras.reviews.items.map((r, i) => (
                <li key={`${r.createdAt}-${i}`}>
                  <p className={`${b.mono} ${c.reviewMeta}`}>
                    {r.reviewer} · {reviewDate(r.createdAt, lang)}
                    {extras.reviews.rating !== null && (
                      <>
                        {' '}
                        · <Stars value={r.rating} alt={t('site.coachPage.starsAlt', { n: r.rating })} />
                      </>
                    )}
                  </p>
                  {r.comment && <p className={c.reviewText}>{r.comment}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
