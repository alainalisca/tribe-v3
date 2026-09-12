'use client';

/**
 * "Solicitudes de sede" -- the gym's approval queue (T-GYM2).
 *
 * Mounts in the partner dashboard, which already redirects anyone without a
 * partner row. That is convenience, not security: review_venue_request checks
 * featured_partners.user_id inside the database, so another instructor calling
 * it is refused there.
 *
 * The instructor is a person, so their avatar stays a circle. The gym is the
 * organization and is not repeated here -- the whole section belongs to it.
 */
import { Check, X, Clock, AlertCircle, Repeat } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { useLanguage } from '@/lib/LanguageContext';
import type { VenueRequest } from '@/lib/dal/gymVenue';
import type { VenueDecision } from '@/hooks/useVenueRequests';

/** App language -> date locale. A map rather than a ternary on `language`. */
const DATE_LOCALES: Record<string, string> = { es: 'es-CO', en: 'en-US' };

interface Props {
  gymName: string;
  requests: VenueRequest[];
  loading: boolean;
  deciding: string | null;
  autoApprove: boolean;
  onDecide: (request: VenueRequest, decision: VenueDecision) => void;
  onToggleAutoApprove: (next: boolean) => void;
}

/** "Requested on" -- a date the gym can act on, not a latency measure. */
function formatRequestedOn(iso: string, locale: string): string {
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return '';
  return stamp.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

function formatWhen(date: string, startTime: string | null, locale: string): string {
  const stamp = new Date(`${date}T${startTime ?? '00:00'}`);
  if (Number.isNaN(stamp.getTime())) return date;
  return stamp.toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function VenueRequestsSection({
  gymName,
  requests,
  loading,
  deciding,
  autoApprove,
  onDecide,
  onToggleAutoApprove,
}: Props) {
  const t = useTranslations('partner');
  // The APP's language, not the browser's. Reading navigator.language gave a
  // Spanish sentence an English month -- "Solicitada el Sep 11" -- for anyone
  // running the app in Spanish on an English-locale device, which is most
  // phones here. Intl already produces "11 de sept" for es-CO, so the format
  // was never the problem; the locale source was.
  const { language } = useLanguage();
  const locale = DATE_LOCALES[language] ?? DATE_LOCALES.en;

  return (
    <section className="bg-theme-card rounded-2xl border border-theme p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-theme-primary">{t('venueRequests')}</h2>
        {requests.length > 0 && (
          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-tribe-green text-slate-900 text-xs font-bold flex items-center justify-center">
            {requests.length}
          </span>
        )}
      </div>
      <p className="text-xs text-theme-tertiary">{t('venueRequestsHelp', { gym: gymName })}</p>

      {loading ? (
        <div className="h-16 rounded-xl bg-theme-inset animate-pulse" />
      ) : requests.length === 0 ? (
        // Calm, not broken: an empty queue is the normal state.
        <p className="py-6 text-center text-sm text-theme-tertiary">{t('noRequests')}</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.sessionId} className="rounded-xl border border-theme p-3 space-y-2">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar className="w-8 h-8">
                  <AvatarImage loading="lazy" src={request.instructor?.avatarUrl || undefined} />
                  <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-[11px]">
                    {request.instructor?.name?.[0]?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-theme-primary truncate">{request.instructor?.name ?? '—'}</p>
                  <p className="text-xs text-theme-tertiary truncate">
                    {request.title ?? request.sport} · {formatWhen(request.date, request.startTime, locale)}
                  </p>
                </div>
              </div>

              {request.requestedAt && (
                <p className="text-[11px] text-theme-tertiary">
                  {t('requestedOn', { date: formatRequestedOn(request.requestedAt, locale) })}
                </p>
              )}

              {request.notOnRoster && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-500">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  {t('notOnRoster')}
                </p>
              )}

              {/* A gym approving what it reads as one Tuesday session, and
                  getting every Tuesday until March, is how a partnership ends.
                  createChildSession copies the verdict onto generated
                  occurrences, so this has to be said before the tap, not in a
                  changelog. Sits directly above the buttons for that reason. */}
              {request.isRecurring && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <Repeat className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                  {t('recurringWarning')}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onDecide(request, 'approved')}
                  disabled={deciding === request.sessionId}
                  className="flex-1 h-10 rounded-xl bg-tribe-green text-slate-900 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {deciding === request.sessionId ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {t('approve')}
                </button>
                <button
                  type="button"
                  onClick={() => onDecide(request, 'declined')}
                  disabled={deciding === request.sessionId}
                  className="flex-1 h-10 rounded-xl border border-theme text-theme-secondary text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <X className="w-4 h-4" />
                  {t('decline')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-start gap-3 pt-3 border-t border-theme cursor-pointer">
        <input
          type="checkbox"
          checked={autoApprove}
          onChange={(e) => onToggleAutoApprove(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-tribe-green flex-shrink-0"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-theme-primary">{t('autoApproveRoster')}</span>
          <span className="block text-xs text-theme-tertiary">{t('autoApproveRosterHelp', { gym: gymName })}</span>
        </span>
      </label>
    </section>
  );
}
