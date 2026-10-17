import Image from 'next/image';
import Link from 'next/link';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { ArrowRight } from '../icons';
import b from '../base.module.css';
import d from './doors.module.css';

const DOORS = [
  { key: 'athletes', href: '/para-atletas/', img: 'door_ath' },
  { key: 'coaches', href: '/coaches/', img: 'door_coach' },
  { key: 'gyms', href: '/gimnasios/', img: 'door_gym' },
] as const;

/**
 * "Una comunidad. Cuatro puertas.": athletes, coaches, gyms, and the lime
 * Tribe.OS door. Four across on desktop, a 2x2 grid everywhere else; phones
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
                src={`/site/${door.img}.jpg`}
                fill
                sizes="(max-width: 1100px) 50vw, 25vw"
              />
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
        <Link className={`${d.door} ${d.os}`} href="/tribe-os/">
          <div className={d.big}>
            <span className={`${b.lock} ${b.lockInk} ${d.osLock}`}>
              <Image src="/tribe-wordmark.png" alt="" width={176} height={58} sizes="176px" />
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
