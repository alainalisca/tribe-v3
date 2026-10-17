import Image from 'next/image';
import type { ReactNode } from 'react';
import { photo, type PhotoKey } from '@/lib/site/photos';
import b from '../base.module.css';
import p from './pages.module.css';

/**
 * T-SITE1 Part E. A content page's hero (mock .ph2): the page photo, preloaded
 * as the LCP element, a tag over it, the page's one <h1> in two lines (the
 * second in lime), the lede and its actions.
 */
export default function PageHero({
  img,
  alt,
  tag,
  title1,
  title2,
  ledeStrong,
  ledeRest,
  children,
}: {
  img: PhotoKey;
  alt: string;
  tag: string;
  title1: string;
  title2: string;
  ledeStrong: string;
  ledeRest?: string;
  children?: ReactNode;
}) {
  return (
    <section className={p.hero} aria-labelledby="pagina-titulo">
      <div className={`${p.ph} ${b.grain}`}>
        <Image src={photo(img)} alt={alt} fill sizes="100vw" preload fetchPriority="high" />
        <span className={`${b.mono} ${p.tag}`}>{tag}</span>
      </div>
      <div className={b.g}>
        <h1 id="pagina-titulo" className={`${b.disp} ${p.h1}`}>
          {title1}
          <br />
          <em>{title2}</em>
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
