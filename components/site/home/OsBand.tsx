import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from '../icons';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { photo } from '@/lib/site/photos';
import b from '../base.module.css';
import v from './tv.module.css';

/** One line on Tribe.OS and a way in. No prices (Part D.4). */
export default function OsBand({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={`${v.osband} ${b.g}`} aria-label="Tribe.OS">
      <span className={`${b.lock} ${v.osLock}`}>
        <Image src={photo('logo_w')} alt="Tribe" width={158} height={52} sizes="158px" />
        <span>OS</span>
      </span>
      <p>
        <b>{t('site.home.osStrong')}</b> {t('site.home.osRest')}
      </p>
      <Link className={b.cta} href="/tribe-os/">
        {t('site.home.seeOs')} <ArrowRight />
      </Link>
    </section>
  );
}
