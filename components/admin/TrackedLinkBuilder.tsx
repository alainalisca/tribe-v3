'use client';

/**
 * The tracked link builder (T-GROW1 part G).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS AND IS NOT "JUST TYPE THE URL"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The expensive failure for this whole feature is a QR printed, laminated and
 * stuck to a wall in a gym carrying `?src=IG Reel`. sanitizeTag drops that to
 * NULL on arrival, so every lead off that poster is untagged, nothing in the
 * product reports an error, and the first anyone knows is that a channel appears
 * to have sent nobody. By then the posters exist.
 *
 * So this is the one place in the app that MINTS a tag rather than reading one,
 * and lib/growth/trackedLink.ts runs the same sanitizers the capture path uses.
 * The preview is not decoration: it is the built link, so what is copied and what
 * is encoded in the QR are the string that was validated.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE QR IS FETCHED, NOT RENDERED HERE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * lib/qr/renderQrSvg.ts is `server-only`, so importing it here is a BUILD error
 * rather than a runtime surprise -- deliberately, because T-AV23 keeps
 * qrcode-generator out of the client bundle and a guard checks .next/static for
 * it. /api/admin/qr returns the SVG and the canvas below turns it into a PNG,
 * which is what the spec asked for with no new dependency.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE CODE HINT IS A HINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * judgeCode answers two questions and the UI treats them very differently. The
 * convention (CHANNEL-DETAIL-NN) is ADVISORY -- a builder that refused anything
 * off-convention would be wrong the first time Al needs a code nobody
 * anticipated, and the workaround is to hand-write the URL, which loses the
 * sanitising. Whether the capture path would ACCEPT the code is not advisory, and
 * that message is the warning colour.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Copy, Check, QrCode } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { buildTrackedLink, judgeCode, type LinkDestination } from '@/lib/growth/trackedLink';

const FIELD =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-tribe-dark placeholder:text-stone-400 dark:border-tribe-mid dark:bg-tribe-surface dark:text-white dark:placeholder:text-gray-500';
const LABEL = 'mb-1 block text-xs font-medium text-stone-600 dark:text-gray-400';
/**
 * A 44px minimum tap target, which is the iOS guideline and the reason this is a
 * constant rather than inline: these two buttons are the ones Al presses on a
 * phone while standing in a gym, and py-2 alone comes out under it.
 */
const BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40';

export default function TrackedLinkBuilder() {
  const t = useTranslations('adminOrigen');

  const [destination, setDestination] = useState<LinkDestination>('pase');
  const [target, setTarget] = useState('');
  const [src, setSrc] = useState('');
  const [code, setCode] = useState('');
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * window.location.origin, read at render rather than from an env var.
   *
   * NEXT_PUBLIC_SITE_URL is localhost in this repo's .env and its production
   * value was flagged as unconfirmed in the T-GROW0 recon. A link built from a
   * wrong origin and printed on a poster is unrecoverable, whereas the origin the
   * admin is currently looking at is correct by construction -- if they are on
   * the preview they get a preview link, which is what they want while testing.
   */
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const link = useMemo(
    () => buildTrackedLink(origin, { destination, target, src, code, utmCampaign: campaign }),
    [origin, destination, target, src, code, campaign]
  );

  const judged = useMemo(() => (code.trim() === '' ? null : judgeCode(code)), [code]);

  const copy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // An iOS webview without clipboard permission, or an insecure origin. The
      // link is already on screen and selectable, so the message says to copy it
      // by hand rather than pretending the action succeeded.
      logError(error, { action: 'TrackedLinkBuilder.copy' });
      showError(t('copyError'));
    }
  }, [link, t]);

  /**
   * Fetch the SVG, draw it on a canvas, download a PNG.
   *
   * THE SIZE IS FIXED AT 1024 AND THAT IS THE POINT. A QR scaled from its
   * natural module size is blurry at the edges, and a blurry QR on a printed
   * poster is one that needs three attempts to scan. 1024 is large enough to
   * print at A4 and small enough to be an instant canvas draw.
   *
   * imageSmoothingEnabled = false keeps the module edges hard through the scale
   * up, which is the same reason renderQrSvg sets shape-rendering="crispEdges".
   * Smoothing a QR is how you get grey module borders that a scanner has to
   * threshold, and thresholding is where a scan takes three attempts.
   */
  const downloadQr = useCallback(async () => {
    if (!link || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/qr?url=${encodeURIComponent(link.url)}`);
      if (!res.ok) throw new Error(`qr_${res.status}`);
      const svg = await res.text();

      // A data URL rather than a blob URL: a blob needs revoking, and an
      // un-revoked one leaks for the life of the document.
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('qr_decode'));
        img.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('qr_no_canvas');
      ctx.imageSmoothingEnabled = false;
      // White behind it explicitly. The SVG has its own rect, but a transparent
      // PNG dropped into a dark slide deck becomes an unscannable black square.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);

      const a = document.createElement('a');
      // Named for what it tracks, not "qr.png". Al will have a folder of these
      // and a filename is the only thing that tells two posters apart.
      const slug = [code.trim() || src.trim() || 'tribe', destination].filter(Boolean).join('-').toLowerCase();
      a.download = `qr-${slug.replace(/[^a-z0-9-]/g, '')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch (error) {
      logError(error, { action: 'TrackedLinkBuilder.downloadQr' });
      showError(t('qrError'));
    } finally {
      setBusy(false);
    }
  }, [link, busy, code, src, destination, t]);

  const targetLabel =
    destination === 'pase'
      ? t('targetPase')
      : destination === 'storefront'
        ? t('targetStorefront')
        : t('targetSession');

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-tribe-mid dark:bg-tribe-surface">
      <h3 className="mb-3 text-sm font-bold text-tribe-dark dark:text-white">{t('builderTitle')}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="tl-dest">
            {t('builderDestination')}
          </label>
          <select
            id="tl-dest"
            value={destination}
            onChange={(e) => setDestination(e.target.value as LinkDestination)}
            className={FIELD}
          >
            <option value="pase">{t('destPase')}</option>
            <option value="storefront">{t('destStorefront')}</option>
            <option value="session">{t('destSession')}</option>
            <option value="home">{t('destHome')}</option>
          </select>
        </div>

        {/* Home needs no target, so the field is not rendered rather than
            disabled: a disabled input that can never apply is a control the
            reader has to work out the irrelevance of. */}
        {destination !== 'home' && (
          <div>
            <label className={LABEL} htmlFor="tl-target">
              {targetLabel}
            </label>
            <input id="tl-target" value={target} onChange={(e) => setTarget(e.target.value)} className={FIELD} />
          </div>
        )}

        <div>
          <label className={LABEL} htmlFor="tl-src">
            {t('fieldSrc')}
          </label>
          <input
            id="tl-src"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder={t('fieldSrcPlaceholder')}
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="tl-code">
            {t('fieldCode')}
          </label>
          <input
            id="tl-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('fieldCodePlaceholder')}
            className={FIELD}
          />
          {/* Two hints, two weights. "Cannot be tracked" is the one that costs a
              poster, so it is the warning colour; the convention note is grey. */}
          {judged && !judged.capturable && (
            <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-400">{t('hintUncapturable')}</p>
          )}
          {judged && judged.capturable && !judged.conventional && (
            <p className="mt-1 text-xs text-stone-500 dark:text-gray-400">{t('hintUnconventional')}</p>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="tl-campaign">
            {t('fieldCampaign')}
          </label>
          <input
            id="tl-campaign"
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder={t('fieldCampaignPlaceholder')}
            className={FIELD}
          />
        </div>
      </div>

      <div className="mt-4">
        {link ? (
          <>
            {/* break-all, not truncate: a URL that is going on a poster has to be
                readable in full so a typo in the code is visible here rather
                than after printing. */}
            <p className="mb-3 break-all rounded-lg bg-stone-100 p-3 font-mono text-xs text-tribe-dark dark:bg-tribe-mid dark:text-white">
              {link.url}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copy()} className={`${BUTTON} bg-tribe-green text-tribe-dark`}>
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? t('copied') : t('copyLink')}
              </button>
              <button
                type="button"
                onClick={() => void downloadQr()}
                disabled={busy}
                className={`${BUTTON} border border-stone-300 text-tribe-dark dark:border-tribe-mid dark:text-white`}
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                {t('downloadQr')}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-stone-500 dark:text-gray-400">{t('incomplete')}</p>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-stone-500 dark:text-gray-400">{t('conventionNote')}</p>
    </section>
  );
}
