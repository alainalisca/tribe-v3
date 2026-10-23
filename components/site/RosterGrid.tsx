import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { isOptimizableImage } from '@/lib/site/imageHosts';
import { usableAvatarUrl } from '@/lib/avatarSrc';
import { COACH_SITE_PHOTOS, faceProps, photo } from '@/lib/site/photos';
import { balancedColumns, type RosterCoach } from '@/lib/site/rosterBuild';
import { translateSport } from '@/lib/sportTranslationData';
import b from './base.module.css';
import r from './roster.module.css';

/**
 * T-SITE1.1 Part C. The live coach roster (lib/site/roster.ts), on Inicio
 * (first 12) and Coaches (everyone). Square photos, the sport as a black tag,
 * no rounded corners; a coach without a usable photo gets an ink block with
 * their initials. Each card opens /i/<id>/, the public coach page.
 *
 * Site polish: a coach in COACH_SITE_PHOTOS shows Al's photo of them instead
 * of their avatar, and the grid balances its columns (--cols, --cols-md) so the
 * last row is never mostly empty.
 */
export default function RosterGrid({
  lang,
  coaches,
  max,
}: {
  lang: SiteLanguage;
  coaches: readonly RosterCoach[];
  max?: number;
}) {
  const t = siteT(lang);
  const shown = max === undefined ? coaches : coaches.slice(0, max);
  if (shown.length === 0) {
    return (
      <p className={r.empty}>
        {t('site.roster.empty')}{' '}
        <Link className={b.ulink} href="/coaches/">
          {t('site.roster.emptyCta')}
        </Link>
      </p>
    );
  }
  return (
    <ul
      className={r.grid}
      style={
        {
          '--cols': balancedColumns(shown.length, 6),
          '--cols-md': balancedColumns(shown.length, 4),
        } as CSSProperties
      }
    >
      {shown.map((c) => (
        <li key={c.id}>
          <Link href={c.href}>
            <figure className={r.ph}>
              {/* A stock photo is not the coach (T-JOIN1): initials, like no photo. */}
              {COACH_SITE_PHOTOS[c.id] ? (
                <Image
                  src={photo(COACH_SITE_PHOTOS[c.id])}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="(max-width: 900px) 46vw, 20vw"
                  {...faceProps(COACH_SITE_PHOTOS[c.id])}
                />
              ) : isOptimizableImage(c.avatarUrl) && usableAvatarUrl(c.avatarUrl) ? (
                // The name is right below: the photo is decorative.
                <Image src={c.avatarUrl} alt="" aria-hidden="true" fill sizes="(max-width: 900px) 46vw, 20vw" />
              ) : (
                <span className={r.initials} aria-hidden="true">
                  {c.initials}
                </span>
              )}
              {c.sport && <span className={b.capTag}>{translateSport(c.sport, lang)}</span>}
            </figure>
            <h3>{c.name}</h3>
            {c.place && <p>{c.place}</p>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
