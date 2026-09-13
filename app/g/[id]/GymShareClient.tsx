'use client';

/**
 * The public gym page, /g/[slug]. The bio-link destination.
 *
 * Mirrors app/i/[id]/ in shape -- a thin server component that owns metadata
 * and the 404, plus this client child -- but not in content. An instructor page
 * is a person (avatar, rating, bio, sessions by creator_id); this is an
 * organisation (square logo, type line, address, sessions by venue). Nothing is
 * shared between them beyond the OG endpoint and TribeWordmark, which were
 * already shared.
 *
 * The partner row arrives as a prop, already resolved on the server from
 * partners_public. Only the session list is fetched here, because it depends on
 * today's date and on whether the visitor has a session.
 *
 * i18n: useTranslations + lib/dateLocale throughout. /i/[id] is full of
 * `language === 'es' ?` ternaries and this deliberately adds none.
 */
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Clock, MapPin, Globe, Phone } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { dateLocale } from '@/lib/dateLocale';
import { trackEvent } from '@/lib/analytics';
import { partnerMonogram, partnerTypeLabelKey } from '@/lib/partnerIdentity';
import { partnerDescription, type PublicPartner } from '@/lib/partnerPublic';
import TribeWordmark from '@/components/TribeWordmark';

interface VenueSession {
  id: string;
  title: string;
  sport: string;
  date: string;
  start_time: string | null;
  location: string | null;
}

export default function GymShareClient({ partner }: { partner: PublicPartner }) {
  const { language } = useLanguage();
  const t = useTranslations('gymPage');
  const tPartner = useTranslations('partner');
  const supabase = createClient();

  const [sessions, setSessions] = useState<VenueSession[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const today = new Date().toISOString().split('T')[0];

      const [sessionsRes, userRes] = await Promise.all([
        supabase
          // sessions_public, never public.sessions: migration 140 revoked anon
          // from the base table, so a query against it passes every test (the
          // DAL is mocked) and returns zero rows for every logged-out visitor.
          // 158 added the three partner columns to this view for exactly this.
          .from('sessions_public')
          .select('id, title, sport, date, start_time, location')
          .eq('partner_id', partner.id)
          // Only sessions the gym has approved carry its name. Anything below
          // 'approved' is a claim the gym has not agreed to.
          .eq('partner_status', 'approved')
          .gte('date', today)
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })
          .limit(10),
        supabase.auth.getUser(),
      ]);

      if (cancelled) return;

      if (sessionsRes.error) {
        // Logged where it can be seen. Swallowing this is what hid the
        // "/s/[id] session not found" bug for months.
        console.error('[/g/[id]] venue sessions fetch failed', sessionsRes.error);
      }
      setSessions(sessionsRes.data ?? []);
      setUserId(userRes.data?.user?.id ?? null);
    }

    load();
    trackEvent('gym_public_page_viewed', { partner_id: partner.id, slug: partner.slug });

    return () => {
      cancelled = true;
    };
  }, [partner.id, partner.slug, supabase]);

  const typeKey = partnerTypeLabelKey(partner.business_type);
  const typeLabel = typeKey ? tPartner(typeKey) : null;
  const description = partnerDescription(partner, language);
  const specialties = partner.specialties ?? [];
  const locale = dateLocale(language);

  return (
    <div
      className="min-h-screen bg-tribe-dark"
      // The one number for nav height, defined once in globals.css. No BottomNav
      // is mounted on this route (it is a share page, like /i/[id]), but the
      // same custom property also carries the iOS safe-area floor, which is what
      // pushed the storefront's CTA under Safari's toolbar in T-GYM2.
      style={{ paddingBottom: 'calc(var(--bottom-nav-h) + 1rem)' }}
    >
      <div className="px-6 pt-10 pb-4 text-center">
        <TribeWordmark className="h-6 w-auto" />
        <p className="mt-1 text-sm text-theme-tertiary">{t('tagline')}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-4">
        <div className="bg-tribe-surface rounded-2xl p-6 border border-tribe-mid">
          <div className="flex flex-col items-center text-center">
            {/* Rounded SQUARE at 80px, matching GymsAndStudiosSection. People
                are circles, organisations are squares -- the visual grammar
                from T-GYM1, and this page is the largest place it shows. */}
            <div className="w-20 h-20 rounded-2xl border-[3px] border-tribe-green mb-4 overflow-hidden bg-tribe-dark flex items-center justify-center">
              {partner.logo_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={partner.logo_image_url} alt={partner.business_name} className="w-full h-full object-cover" />
              ) : (
                <span aria-hidden="true" className="text-tribe-green text-2xl font-bold tracking-tight">
                  {partnerMonogram(partner.business_name)}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-white">{partner.business_name}</h1>

            {typeLabel && (
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-theme-tertiary">{typeLabel}</p>
            )}

            {partner.address && (
              <p className="mt-2 flex items-start justify-center gap-1 text-sm text-theme-tertiary">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="min-w-0">{partner.address}</span>
              </p>
            )}
          </div>

          {description && (
            <p className="mt-5 text-sm text-theme-secondary leading-relaxed whitespace-pre-line">{description}</p>
          )}

          {specialties.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              {specialties.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-tribe-green/20 text-tribe-green text-xs font-bold rounded-full uppercase tracking-wide"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {(partner.website_url || partner.phone) && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {partner.website_url && (
                <a
                  href={partner.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-tribe-mid px-4 py-2 text-sm font-semibold text-white"
                >
                  <Globe className="w-4 h-4" />
                  {t('website')}
                </a>
              )}
              {partner.phone && (
                <a
                  href={`tel:${partner.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-tribe-mid px-4 py-2 text-sm font-semibold text-white"
                >
                  <Phone className="w-4 h-4" />
                  {t('call')}
                </a>
              )}
            </div>
          )}

          {/* Identical for a signed-in and a signed-out visitor: this page is
              built for strangers arriving from a bio link, and an auth-dependent
              primary CTA would make the two renders differ for no gain. */}
          <Link
            href="/download/"
            className="block w-full text-center mt-6 py-4 bg-tribe-green text-slate-900 font-bold text-lg rounded-xl hover:brightness-110 transition"
          >
            {t('openInApp')}
          </Link>
        </div>

        <div className="bg-tribe-surface rounded-2xl p-6 border border-tribe-mid">
          <h2 className="text-lg font-bold text-white mb-4">{t('upcomingSessions')}</h2>

          {sessions.length === 0 ? (
            <p className="text-sm text-theme-tertiary">{t('noUpcomingSessions')}</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => {
                // Locale follows the APP language, never the device or the
                // server: lib/dateLocale exists because navigator.language put
                // an English month inside a Spanish sentence.
                const day = new Date(s.date + 'T12:00:00').toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                });
                const time = s.start_time
                  ? new Date(`2000-01-01T${s.start_time}`).toLocaleTimeString(locale, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : null;

                return (
                  <Link
                    key={s.id}
                    // The public share route for a visitor with no session; the
                    // in-app detail page for one who has. /session/[id] is
                    // auth-gated, so sending a stranger there is a redirect to
                    // /auth in the middle of a bio-link visit.
                    href={userId ? `/session/${s.id}/` : `/s/${s.id}/`}
                    className="block p-3 rounded-xl bg-tribe-dark/50 hover:bg-tribe-mid/50 transition border border-tribe-mid"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{s.title}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-theme-tertiary">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {day}
                          </span>
                          {time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {time}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="flex-shrink-0 text-xs text-tribe-green font-bold uppercase">{s.sport}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
