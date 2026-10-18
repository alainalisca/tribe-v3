import Image from 'next/image';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { isOptimizableImage } from '@/lib/site/imageHosts';
import br from './bridge.module.css';

/**
 * T-JOIN1 Part A. The top of a session, poster style: a 4:5 photo with the
 * title over it in Big Shoulders (uppercase, two lines at most, 32px or more
 * at 390), the black caption tag bottom-left and a lime tag bottom-right.
 *
 * With no photo: ink with a faint 24px grid, the same title, the sport in lime
 * above it. Never crops a face: the photo is anchored by `anchor` (an
 * object-position), top centre by default.
 *
 * Words come in as props, already in the page's language: the app's client
 * pages render this without any site copy.
 */
export default function PosterHeader({
  title,
  sport,
  photoUrl,
  caption,
  tag,
  anchor = 'center top',
  headingLevel = 1,
}: {
  title: string;
  sport: string | null;
  photoUrl: string | null;
  caption?: string | null;
  tag?: string | null;
  anchor?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className={`${br.bridge} ${SITE_FONT_CLASS} ${br.poster}`}>
      {photoUrl ? (
        <>
          {isOptimizableImage(photoUrl) ? (
            // T-SSR1: the poster is never wider than the 560px session column
            // (signed out; signed in it shows only with no photo).
            <Image
              src={photoUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 560px) 560px, 100vw"
              style={{ objectPosition: anchor }}
            />
          ) : (
            // A host next/image is not configured for: a plain image, never a broken one.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectPosition: anchor }}
            />
          )}
          <div className={br.shade} aria-hidden="true" />
        </>
      ) : (
        <div className={br.grid} aria-hidden="true" />
      )}
      <div className={br.posterText}>
        {!photoUrl && sport && <span className={`${br.mono} ${br.posterSport}`}>{sport}</span>}
        <Heading className={`${br.disp} ${br.posterTitle}`}>{title}</Heading>
      </div>
      {caption && <span className={`${br.mono} ${br.caption}`}>{caption}</span>}
      {tag && <span className={`${br.mono} ${br.limeTag}`}>{tag}</span>}
    </header>
  );
}
