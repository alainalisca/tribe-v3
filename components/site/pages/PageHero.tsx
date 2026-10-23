import Image, { getImageProps } from 'next/image';
import type { ReactNode } from 'react';
import { backgroundBoxStyle, faceProps, photo, type PhotoKey } from '@/lib/site/photos';
import Dotted from '../Dotted';
import b from '../base.module.css';
import p from './pages.module.css';

/** Phones get the `imgPhone` cut; <picture> serves each screen only its own cut. */
const PHONE_MEDIA = '(max-width: 860px)';

function ArtDirected({ img, imgPhone, alt }: { img: PhotoKey; imgPhone: PhotoKey; alt: string }) {
  const common = { alt, fill: true, sizes: '100vw' } as const;
  const phone = getImageProps({ ...common, src: photo(imgPhone) }).props;
  const desk = getImageProps({ ...common, src: photo(img), fetchPriority: 'high' }).props;
  return (
    <picture>
      {/* React hoists these into <head>: each cut is preloaded only for its own screens. */}
      <link
        rel="preload"
        as="image"
        imageSrcSet={phone.srcSet}
        imageSizes="100vw"
        media={PHONE_MEDIA}
        fetchPriority="high"
      />
      <link
        rel="preload"
        as="image"
        imageSrcSet={desk.srcSet}
        imageSizes="100vw"
        media="(min-width: 861px)"
        fetchPriority="high"
      />
      <source media={PHONE_MEDIA} srcSet={phone.srcSet} sizes="100vw" />
      {/* eslint-disable-next-line @next/next/no-img-element -- art direction: next/image props via getImageProps */}
      <img {...desk} alt={alt} {...faceProps(img)} style={{ ...desk.style, ...faceProps(img).style }} />
    </picture>
  );
}
/**
 * T-SITE1 Part E. A content page's hero (mock .ph2): the page photo, preloaded
 * as the LCP element, a tag over it, the page's one <h1> in two lines (the
 * second in lime), the lede and its actions.
 *
 * `imgPhone` (site polish): a second cut of the same photo for phones, where
 * the box is nearly square and the wide cut would push faces off its edges.
 * Served through <picture>, so a phone downloads only its own cut; each cut
 * is preloaded for its own media query.
 */
export default function PageHero({
  img,
  imgPhone,
  alt,
  tag,
  title1,
  title2,
  ledeStrong,
  ledeRest,
  caption,
  lowGradient,
  children,
}: {
  img: PhotoKey;
  /** The phone cut of the same photo (site polish). */
  imgPhone?: PhotoKey;
  alt: string;
  tag: string;
  title1: string;
  title2: string;
  ledeStrong: string;
  ledeRest?: string;
  /** The photo's caption tag (site.cap.<key>), bottom right. */
  caption?: string;
  /** Darken only the bottom 45%, so a face in the top third stays clear (Para atletas). */
  lowGradient?: boolean;
  children?: ReactNode;
}) {
  return (
    <section className={p.hero} aria-labelledby="pagina-titulo">
      <div className={`${p.ph} ${b.grain} ${lowGradient ? p.phLow : ''}`} style={backgroundBoxStyle(img)}>
        {imgPhone ? (
          <ArtDirected img={img} imgPhone={imgPhone} alt={alt} />
        ) : (
          <Image src={photo(img)} alt={alt} fill sizes="100vw" preload fetchPriority="high" {...faceProps(img)} />
        )}
        <span className={`${b.mono} ${p.tag}`}>{tag}</span>
        {caption && <span className={`${b.mono} ${p.credit}`}>{caption}</span>}
      </div>
      {/* Site polish: the lede sits beside the headline on desktop, so there is
          no empty block to its right (Al, 2026-10-23); below it on phones. */}
      <div className={`${b.g} ${p.heroBody}`}>
        <h1 id="pagina-titulo" className={`${b.disp} ${p.h1}`}>
          <Dotted text={title1} />
          <br />
          <em>
            <Dotted text={title2} />
          </em>
        </h1>
        <div className={p.lede}>
          <p>
            <b>{ledeStrong}</b>
            {ledeRest ? ` ${ledeRest}` : ''}
          </p>
          {children && <div className={`${b.acts} ${p.acts}`}>{children}</div>}
        </div>
      </div>
    </section>
  );
}
