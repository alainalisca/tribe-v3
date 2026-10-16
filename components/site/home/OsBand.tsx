import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from '../icons';
import { T } from '../T';
import b from '../base.module.css';
import v from './tv.module.css';

/** One line on Tribe.OS and a way in. No prices (Part D.4). */
export default function OsBand() {
  return (
    <section className={`${v.osband} ${b.g}`} aria-label="Tribe.OS">
      <span className={`${b.lock} ${v.osLock}`}>
        <Image src="/tribe-wordmark.png" alt="" width={158} height={52} sizes="158px" />
        <span>OS</span>
      </span>
      <p>
        <b>
          <T k="site.home.osStrong" />
        </b>{' '}
        <T k="site.home.osRest" />
      </p>
      <Link className={b.cta} href="/tribe-os/">
        <T k="site.home.seeOs" /> <ArrowRight />
      </Link>
    </section>
  );
}
