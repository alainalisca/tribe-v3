import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo } from '@/lib/site/photos';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import d from './doors.module.css';

const DOORS = [
  { key: 'athletes', href: '/para-atletas/', img: 'door_ath' },
  { key: 'coaches', href: '/coaches/', img: 'door_coach' },
  { key: 'gyms', href: '/gimnasios/', img: 'door_gym' },
] as const;

/**
 * "Una comunidad. Cuatro puertas.": athletes, coaches, gyms, and the Tribe.OS
 * door (its photo at 40% brightness under the Tribe.OS wordmark). Four across on desktop, a 2x2 grid everywhere else; phones
 * drop the body line and keep the title and the way in.
 */
export default function Doors({ lang }: { lang: SiteLanguage }) {
  const t = siteT(lang);
  return (
    <section className={`${b.sec} ${b.g}`} aria-labelledby="puertas-titulo">
      <div className={b.sh}>
        <div>
          <span className={`${b.mono} ${b.kick}`}>{t('site.home.doorsKick')}</span>
          <h2 id="puertas-titulo" className={b.disp}>
            {t('site.home.doorsTitle1')}
            <br />
            {t('site.home.doorsTitle2')}
          </h2>
        </div>
        <p className={b.phoneHide}>{t('site.home.doorsLede')}</p>
      </div>
      <div className={d.doors}>
        {DOORS.map((door, i) => (
          <Link key={door.key} className={d.door} href={door.href}>
            <div className={d.im}>
              <Image
                alt={t(`site.alt.${door.img}`)}
                src={photo(door.img)}
                fill
                sizes="(max-width: 1100px) 50vw, 25vw"
                {...faceProps(door.img)}
              />
              <span className={b.capTag}>{t(`site.cap.${door.img}`)}</span>
            </div>
            <div className={d.tx}>
              <span className={`${b.mono} ${d.label}`}>
                0{i + 1} · {t(`site.nav.${door.key}`)}
              </span>
              <h3>{t(`site.home.door_${door.key}_title`)}</h3>
              <p>{t(`site.home.door_${door.key}_body`)}</p>
              <span className={d.go}>
                {t(`site.home.door_${door.key}_go`)} <ArrowRight />
              </span>
            </div>
          </Link>
        ))}
        <Link className={d.door} href="/tribe-os/">
          <div className={`${d.im} ${d.osIm}`}>
            {/* Darkened in the file itself (scripts/site-crops.mjs, brightness 0.4). */}
            <Image src={photo('door_os')} alt="" aria-hidden="true" fill sizes="(max-width: 1100px) 50vw, 25vw" />
            <span className={`${b.lock} ${d.osLock}`}>
              <Image src={photo('logo_w')} alt="Tribe" width={176} height={58} sizes="176px" />
              <span>OS</span>
            </span>
          </div>
          <div className={d.tx}>
            <span className={d.badge}>
              <i />
              {t('site.home.inDevelopment')}
            </span>
            <h3>{t('site.home.door_os_title')}</h3>
            <p>{t('site.home.door_os_body')}</p>
            <span className={d.go}>
              {t('site.home.door_os_go')} <ArrowRight />
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
