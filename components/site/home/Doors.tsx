import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from '../icons';
import { SiteImage, T } from '../T';
import b from '../base.module.css';
import d from './doors.module.css';

const DOORS = [
  { key: 'athletes', href: '/para-atletas/', img: 'door_ath' },
  { key: 'coaches', href: '/coaches/', img: 'door_coach' },
  { key: 'gyms', href: '/gimnasios/', img: 'door_gym' },
] as const;

/** "Una comunidad. Cuatro puertas.": athletes, coaches, gyms, and the lime Tribe.OS door. */
export default function Doors() {
  return (
    <section className={`${b.sec} ${b.g}`} aria-labelledby="puertas-titulo">
      <div className={b.sh}>
        <div>
          <span className={`${b.mono} ${b.kick}`}>
            <T k="site.home.doorsKick" />
          </span>
          <h2 id="puertas-titulo" className={b.disp}>
            <T k="site.home.doorsTitle1" />
            <br />
            <T k="site.home.doorsTitle2" />
          </h2>
        </div>
        <p>
          <T k="site.home.doorsLede" />
        </p>
      </div>
      <div className={d.doors}>
        {DOORS.map((door, i) => (
          <Link key={door.key} className={d.door} href={door.href}>
            <div className={d.im}>
              <SiteImage
                altKey={`site.alt.${door.img}`}
                src={`/site/${door.img}.jpg`}
                fill
                sizes="(max-width: 600px) 100vw, (max-width: 1100px) 50vw, 25vw"
              />
            </div>
            <div className={d.tx}>
              <span className={`${b.mono} ${d.label}`}>
                0{i + 1} · <T k={`site.nav.${door.key}`} />
              </span>
              <h3>
                <T k={`site.home.door_${door.key}_title`} />
              </h3>
              <p>
                <T k={`site.home.door_${door.key}_body`} />
              </p>
              <span className={d.go}>
                <T k={`site.home.door_${door.key}_go`} /> <ArrowRight />
              </span>
            </div>
          </Link>
        ))}
        <Link className={`${d.door} ${d.os}`} href="/tribe-os/">
          <div className={d.big}>
            <span className={`${b.lock} ${b.lockInk}`} style={{ '--lh': '58px' } as React.CSSProperties}>
              <Image src="/tribe-wordmark.png" alt="" width={176} height={58} sizes="176px" />
              <span>OS</span>
            </span>
          </div>
          <div className={d.tx}>
            <span className={d.badge}>
              <i />
              <T k="site.home.inDevelopment" />
            </span>
            <h3>
              <T k="site.home.door_os_title" />
            </h3>
            <p>
              <T k="site.home.door_os_body" />
            </p>
            <span className={d.go}>
              <T k="site.home.door_os_go" /> <ArrowRight />
            </span>
          </div>
        </Link>
      </div>
    </section>
  );
}
