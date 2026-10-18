import Link from 'next/link';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import br from '../bridge/bridge.module.css';
import { ArrowRight } from './icons';
import w from './week.module.css';

/**
 * One session as a row. The site's "La semana" board (T-SITE1 Part B), a sport
 * page's week block and the coach page (T-SHARE1) render it in the site frame
 * (`tone="site"`, inside a `w.table`, or a `w.table w.paper` on paper). T-JOIN1
 * Part A adapted it for the app (`tone="app"`): the bridge's compact row, time
 * on the left, sport over a two-line title, price or "Gratis" on the right.
 *
 * It takes a Fixture already worded in the page's language and its labels, and
 * imports no site copy, so a client page can render it without shipping
 * messages/site to the browser. lib/site/fixture.ts builds both from a board
 * row on the server.
 *
 * The whole row is one link, and its accessible name is its visible text (no
 * aria-label, Al 2026-10-17: a voice-control user can say any of it, WCAG 2.5.3).
 */
export type Fixture = {
  id: string;
  href: string;
  /** "Lun a vie", "Sáb", or a date for a session past this week. */
  days: string | null;
  /** "06:00". */
  time: string;
  /** The sport's name in the page language; null for "Other". */
  sport: string | null;
  /** The title, or the fallback "<Deporte> con <Nombre>". */
  title: string;
  /** The site row's small line: "Boxeo · 60 min · 25.000". */
  detail: string | null;
  place: string | null;
  coach: string | null;
  /** The price as shown ("25.000"), or 'free'. */
  price: string | 'free';
  spots: number | null;
};

export type FixtureLabels = {
  free: string;
  /** "{n} cupos". */
  spots: string;
  spotsOne: string;
  /** The site row's action: "Pedir cupo", or "Reserva" on the coach page. */
  action: string;
};

const spotsText = (n: number, l: FixtureLabels) => (n === 1 ? l.spotsOne : l.spots.replace('{n}', String(n)));

export default function FixtureRow({
  fixture: f,
  labels,
  tone = 'site',
}: {
  fixture: Fixture;
  labels: FixtureLabels;
  tone?: 'site' | 'app';
}) {
  if (tone === 'app') {
    const meta = [f.place, f.coach].filter(Boolean).join(' · ');
    return (
      <li className={`${br.bridge} ${SITE_FONT_CLASS}`}>
        <Link className={br.fx} href={f.href}>
          <span className={br.when}>
            <b>{f.time}</b>
            {f.days && <small>{f.days}</small>}
          </span>
          <span className={br.main}>
            {f.sport && <span className={br.sport}>{f.sport}</span>}
            <span className={br.title}>{f.title}</span>
            {meta && <span className={br.meta}>{meta}</span>}
          </span>
          <span className={br.end}>
            {f.price === 'free' ? (
              <span className={br.free}>{labels.free}</span>
            ) : (
              <span className={br.price}>{f.price}</span>
            )}
            {f.spots !== null && <span className={br.spots}>{spotsText(f.spots, labels)}</span>}
          </span>
        </Link>
      </li>
    );
  }

  // Rendered twice: after the title on wide screens, on the place line on
  // phones; the hidden copy is display:none, so it is read once.
  const tags = (
    <>
      {f.price === 'free' ? (
        <span className={w.tag}>{labels.free}</span>
      ) : (
        <span className={`${w.tag} ${w.priceTag}`}>{f.price}</span>
      )}
      {f.spots !== null && <span className={w.tag}>{spotsText(f.spots, labels)}</span>}
    </>
  );
  return (
    <li>
      <Link className={w.row} href={f.href}>
        <span className={w.day}>{f.days}</span>
        <span className={w.hr}>{f.time}</span>
        <span className={w.ses}>
          {f.title}
          <span className={w.tags}>{tags}</span>
          {f.detail && <small>{f.detail}</small>}
        </span>
        <span className={w.loc}>
          {f.place}
          <span className={w.tagsPhone}>{tags}</span>
        </span>
        <span className={w.who}>{f.coach}</span>
        <span className={w.go}>
          {labels.action} <ArrowRight />
        </span>
      </Link>
    </li>
  );
}
