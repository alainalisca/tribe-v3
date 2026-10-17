import { EPISODES } from '@/lib/site/episodes';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { SITE_SPORT_COUNT } from '@/lib/site/sportCount';
import { ROSTER_HOME_MAX, type RosterCoach } from '@/lib/site/rosterBuild';
import RosterGrid from '../RosterGrid';
import b from '../base.module.css';
import s from './story.module.css';

const FACTS = [
  { value: String(SITE_SPORT_COUNT), key: 'factSports' },
  { value: '3', key: 'factPartners' },
  { value: String(EPISODES.length), key: 'factEpisodes' },
] as const;

/**
 * Facts, then the live roster (T-SITE1.1 Part C): coaches with a public session
 * in the last 60 days, the twelve most active first (lib/site/roster.ts).
 */
export default function Roster({ lang, coaches }: { lang: SiteLanguage; coaches: readonly RosterCoach[] }) {
  const t = siteT(lang);
  return (
    <section className={`${b.sec} ${b.g}`} aria-labelledby="coaches-titulo">
      <div className={s.facts}>
        {FACTS.map((f) => (
          <div key={f.key}>
            <b>{f.value}</b>
            <span>{t(`site.home.${f.key}`)}</span>
          </div>
        ))}
        <div>
          <b>{t('site.home.factFreeValue')}</b>
          <span>{t('site.home.factFree')}</span>
        </div>
      </div>
      <div className={`${b.sh} ${s.rosterHead}`}>
        <h2 id="coaches-titulo" className={b.disp}>
          {t('site.home.rosterTitle1')}
          <br />
          {t('site.home.rosterTitle2')}
        </h2>
        <p className={b.phoneHide}>{t('site.home.rosterLede')}</p>
      </div>
      <RosterGrid lang={lang} coaches={coaches} max={ROSTER_HOME_MAX} />
      <p className={`${b.note} ${s.rosterNote}`}>{t('site.home.rosterNote')}</p>
    </section>
  );
}
