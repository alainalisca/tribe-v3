import Image from 'next/image';
import { coachFirstName, coachSports } from '@/lib/og/coachCard';
import type { HeroPhoto } from '@/lib/site/coachPage';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import type { WeekRow } from '@/lib/site/weekTypes';
import { fixtureFromWeekRow, fixtureLabels } from '@/lib/site/fixture';
import FixtureRow from '../FixtureRow';
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
 * there are none. Then the bio and specialties.
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

export default function CoachProfile({
  lang,
  coach,
  gym,
  photo,
  sessions,
  weekEnd,
}: {
  lang: SiteLanguage;
  coach: CoachProfileData;
  gym: string | null;
  photo: HeroPhoto | null;
  sessions: WeekRow[];
  /** The last day of this week (Bogotá); later sessions show their date. */
  weekEnd: string;
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
              priority
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
        </div>
      </section>

      <div className={c.body}>
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

        {(coach.bio || specialties.length > 0) && (
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
          </section>
        )}
      </div>
    </>
  );
}
