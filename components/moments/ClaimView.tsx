'use client';

import Link from 'next/link';
import { PosterHeader } from '@/components/bridge';
import br from '@/components/bridge/bridge.module.css';
import { batchDate, batchTitle } from '@/components/moments/MyMomentos';
import { useLanguage } from '@/lib/LanguageContext';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { hostFirstName } from '@/lib/share/sessionPublic';
import { CONTACT_EMAIL } from '@/lib/site/links';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { useMarkMarketingSurface } from '@/lib/site/marketingSurface';
import { translateSport } from '@/lib/sportTranslationData';
import type { InvitePreview } from '@/lib/moments/claim';
import s from './claim.module.css';

/**
 * T-MOM1 Part C: what /m/<token>/ shows. With photos: the session poster,
 * "Tienes N fotos de <sesión> con <coach>", the first photo in full, the rest
 * as blurred tiles (blurred on the server, lib/moments/claim.ts) and "Ver mis
 * fotos". Otherwise one plain line and "Escríbenos". Like the signed-out
 * session page, it counts as a marketing surface: no install prompt or
 * feedback bubble over the one button.
 */
export type ClaimState =
  | { kind: 'ok'; preview: InvitePreview; cta: string }
  | { kind: 'expired' | 'claimed' | 'not_found' | 'busy' };

const MESSAGE = {
  expired: 'claimExpired',
  claimed: 'claimClaimed',
  not_found: 'claimNotFound',
  busy: 'claimBusy',
} as const;

function Wordmark() {
  return (
    <Link href="/" aria-label="Tribe">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/tribe-wordmark-dark.png" alt="Tribe" style={{ height: 22, width: 'auto' }} />
    </Link>
  );
}

export default function ClaimView({ state }: { state: ClaimState }) {
  useMarkMarketingSurface();
  const t = useTranslations('moments');
  const { language } = useLanguage();
  const lang: 'es' | 'en' = language === 'en' ? 'en' : 'es'; // eslint-disable-line no-restricted-syntax -- a locale for formatting, not copy

  if (state.kind !== 'ok') {
    return (
      <div className={`${br.bridge} ${SITE_FONT_CLASS} ${s.page}`}>
        <div className={s.top}>
          <Wordmark />
        </div>
        <div className={s.message} data-testid="claim-message">
          <p className={s.messageText}>{t(MESSAGE[state.kind])}</p>
          <p className={s.help}>
            {t('claimHelp')} <a href={`mailto:${CONTACT_EMAIL}`}>{t('writeUs')}</a>
          </p>
        </div>
      </div>
    );
  }

  const { preview, cta } = state;
  const title = batchTitle(preview.session, lang);
  const coach = hostFirstName(preview.coachName, preview.session.sport);
  const photos = preview.count === 1 ? t('photosOne') : t('photosCount', { count: preview.count });
  const rest = preview.count - 1;
  const hidden = rest - preview.tiles.length;

  return (
    <div className={`${br.bridge} ${SITE_FONT_CLASS} ${s.page}`}>
      <div className={s.top}>
        <Wordmark />
      </div>
      <div className={s.column}>
        <PosterHeader
          title={title}
          sport={preview.session.sport ? translateSport(preview.session.sport, lang) : null}
          photoUrl={preview.session.photo}
          caption={
            coach ? `${coach} · ${batchDate(preview.session.date, lang)}` : batchDate(preview.session.date, lang)
          }
          tag={photos}
        />
        <div className={s.body}>
          <h2 className={`${br.disp} ${s.headline}`}>
            {coach
              ? t('claimHeadline', { photos, session: title, coach })
              : t('claimHeadlineNoCoach', { photos, session: title })}
          </h2>
          {preview.firstUrl && (
            // A private photo behind a short-lived signed URL: a plain img, never the optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.photo} src={preview.firstUrl} alt="" />
          )}
          {rest > 0 && (
            <>
              <div className={s.tiles} aria-hidden="true">
                {preview.tiles.map((src, i) => (
                  <div key={i} className={s.tile}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" />
                    {hidden > 0 && i === preview.tiles.length - 1 && <span className={s.more}>+{hidden}</span>}
                  </div>
                ))}
              </div>
              <p className={`${br.mono} ${s.waiting}`}>{t('claimMore', { count: rest })}</p>
            </>
          )}
          <p className={s.note}>{t('claimPrivate')}</p>
        </div>
      </div>
      <div className={s.bar}>
        <div className={s.barInner}>
          <a className={s.limeButton} href={cta} data-testid="claim-cta">
            {t('claimCta')}
          </a>
        </div>
      </div>
    </div>
  );
}
