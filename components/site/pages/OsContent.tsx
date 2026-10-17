import Image from 'next/image';
import { siteT, type SiteLanguage } from '@/lib/site/i18n';
import { faceProps, photo } from '@/lib/site/photos';
import WaitlistForm from '../WaitlistForm';
import b from '../base.module.css';
import p from './pages.module.css';

/**
 * Page: /tribe-os/ (T-SITE1 Part E, mock "Tribe.OS"). Not /os, which is the
 * Tribe.OS app. "En desarrollo" stays; no prices on this page (spec D.4). The
 * waitlist posts to /api/tribe-os-waitlist (#lista is its anchor, linked from
 * Preguntas).
 */
export default function OsContent({ lang }: { lang: SiteLanguage }) {
  const tr = siteT(lang);
  const t = (k: string) => tr(`site.os.${k}`);
  return (
    <>
      <section className={`${p.osh} ${b.g}`} aria-labelledby="pagina-titulo">
        <span className={p.ring} aria-hidden="true" />
        <span className={p.ring} aria-hidden="true" />
        <span className={p.badge}>
          <i />
          {t('badge')}
        </span>
        <div>
          <span className={`${b.lock} ${p.osLock}`}>
            <Image src={photo('logo_w')} alt="Tribe" width={176} height={58} sizes="176px" preload />
            <span>OS</span>
          </span>
        </div>
        {/* T-SITE1.1 Part D: the first line smaller, the lime line at full size; three lines at most on a phone. */}
        <h1 id="pagina-titulo" className={b.disp}>
          <span className={p.osFirst}>{t('title1')}</span> <em>{t('title2')}</em>
        </h1>
        <p className={p.lead}>{t('lead')}</p>
      </section>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="dos-partes">
        <div className={b.sh}>
          <h2 id="dos-partes" className={b.disp}>
            {t('bridgeTitle1')}
            <br />
            {t('bridgeTitle2')}
          </h2>
          <p>{t('bridgeLede')}</p>
        </div>
        <div className={p.bridge}>
          <div className={p.side}>
            <span className={`${b.mono} ${b.kick}`}>{t('leftKick')}</span>
            <h3>{t('leftTitle')}</h3>
            <p>{t('leftBody')}</p>
            <figure className={`${p.photo} ${p.photoSide}`}>
              <Image
                src={photo('os_photo')}
                alt={tr('site.alt.os_photo')}
                fill
                sizes="(max-width: 900px) 100vw, 40vw"
                {...faceProps('os_photo')}
              />
              <figcaption className={b.capTag}>{tr('site.cap.os_photo')}</figcaption>
            </figure>
          </div>
          <div className={p.mid} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M4 12h15m-6-6 6 6-6 6" />
            </svg>
          </div>
          <div className={p.side}>
            <span className={`${b.mono} ${b.kick}`}>{t('rightKick')}</span>
            <h3>{t('rightTitle')}</h3>
            <p>{t('rightBody')}</p>
            <div className={p.cardmock} aria-hidden="true">
              <span className={p.av}>LM</span>
              <span>
                <b>
                  {t('cardName')}
                  <span className={p.cardTag}>{t('cardTag')}</span>
                </b>
                <small>{t('cardMeta')}</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${b.sec} ${b.g}`} aria-labelledby="que-trae">
        <div className={b.sh}>
          <h2 id="que-trae" className={b.disp}>
            {t('bringsTitle')}
          </h2>
          <p>{t('bringsLede')}</p>
        </div>
        <ol className={p.ledger}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i}>
              <span className={p.ln}>{String(i).padStart(2, '0')}</span>
              <h3>{t(`l${i}t`)}</h3>
              <p>{t(`l${i}b`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`${b.sec} ${b.g}`} id="lista" aria-labelledby="lista-titulo">
        <div className={p.wait}>
          <div>
            <span className={`${b.mono} ${b.kick}`}>{t('waitKick')}</span>
            <h2 id="lista-titulo" className={b.disp}>
              {t('waitTitle1')}
              <br />
              {t('waitTitle2')}
            </h2>
            <p className={p.waitNote}>{t('waitNote')}</p>
          </div>
          <WaitlistForm
            lang={lang}
            labels={{
              name: t('fName'),
              namePh: t('fNamePh'),
              email: t('fEmail'),
              emailPh: t('fEmailPh'),
              role: t('fRole'),
              roleCoach: t('fRoleCoach'),
              roleGym: t('fRoleGym'),
              teach: t('fTeach'),
              teachPh: t('fTeachPh'),
              sessions: t('fSessions'),
              submit: t('fSubmit'),
              sending: t('fSending'),
              done: t('fDone'),
              error: t('fError'),
            }}
          />
        </div>
      </section>
    </>
  );
}
