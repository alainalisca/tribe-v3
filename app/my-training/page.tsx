'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Activity, Calendar as CalendarIcon, Flame, Share2, Star, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import AchievementBadges from '@/components/AchievementBadges';
import {
  fetchAthleteStats,
  fetchTrainingHeatmap,
  fetchTrainingHistory,
  type AthleteStats,
  type TrainingHistoryEntry,
} from '@/lib/dal/athleteStats';
import { sportTranslations } from '@/lib/translations';
import { haptic } from '@/lib/haptics';
import { trackEvent } from '@/lib/analytics';
import { showSuccess, showError } from '@/lib/toast';

const HEATMAP_DAYS = 84; // 12 weeks

function heatmapClass(count: number): string {
  if (count <= 0) return 'bg-[#3D4349]';
  if (count === 1) return 'bg-lime-900/50';
  if (count === 2) return 'bg-lime-700/70';
  return 'bg-lime-500';
}

function formatDayLabel(dateIso: string, language: 'en' | 'es'): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  return d.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function MyTrainingPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [stats, setStats] = useState<AthleteStats | null>(null);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<TrainingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth');
        return;
      }
      if (cancelled) return;
      setUserId(user.id);

      // Pull display name/avatar for the share card
      const { data: profile } = await supabase.from('users').select('name, avatar_url').eq('id', user.id).maybeSingle();
      if (profile) {
        setUserName((profile as { name: string | null }).name || '');
        setUserAvatar((profile as { avatar_url: string | null }).avatar_url);
      }

      const [statsRes, heatmapRes, historyRes] = await Promise.all([
        fetchAthleteStats(supabase, user.id),
        fetchTrainingHeatmap(supabase, user.id, HEATMAP_DAYS),
        fetchTrainingHistory(supabase, user.id, 20, 0),
      ]);

      if (cancelled) return;
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (heatmapRes.success && heatmapRes.data) setHeatmap(heatmapRes.data);
      if (historyRes.success && historyRes.data) setHistory(historyRes.data);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const t = {
    pageTitle: language === 'es' ? 'Mi Entrenamiento' : 'My Training',
    totalSessions: language === 'es' ? 'Total Sesiones' : 'Total Sessions',
    currentStreak: language === 'es' ? 'Racha Actual' : 'Current Streak',
    weeks: language === 'es' ? 'semanas' : 'weeks',
    sportsTried: language === 'es' ? 'Deportes Probados' : 'Sports Tried',
    instructorsTrainedWith: language === 'es' ? 'Instructores' : 'Instructors',
    heatmapTitle: language === 'es' ? 'Actividad Reciente' : 'Recent Activity',
    heatmapSummary: (n: number) =>
      language === 'es' ? `${n} sesiones en las últimas 12 semanas` : `${n} sessions in the last 12 weeks`,
    historyTitle: language === 'es' ? 'Historial de Entrenamiento' : 'Training History',
    noHistory: language === 'es' ? 'Aún no has asistido a ninguna sesión' : "You haven't attended any sessions yet",
    rateCta: language === 'es' ? 'Calificar →' : 'Rate →',
    milestonesTitle: language === 'es' ? 'Logros' : 'Milestones',
    shareStats: language === 'es' ? 'Compartir Mi Progreso' : 'Share My Stats',
    shareMessage: (n: number) =>
      language === 'es'
        ? `He completado ${n} sesiones en Tribe. ¡Únete a mí!`
        : `I've completed ${n} sessions on Tribe. Join me!`,
    shareCopied: language === 'es' ? 'Enlace copiado' : 'Link copied',
    shareFailed: language === 'es' ? 'No se pudo compartir' : 'Could not share',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
  };

  const handleShare = async () => {
    if (!stats) return;
    setSharing(true);
    try {
      const shareText = t.shareMessage(stats.totalSessions);
      const shareUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/my-training` : 'https://tribe.app/my-training';

      const nav: Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      } = typeof navigator !== 'undefined' ? (navigator as Navigator) : ({} as Navigator);

      if (typeof nav.share === 'function') {
        await nav.share({ title: t.pageTitle, text: shareText, url: shareUrl });
      } else if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        await nav.clipboard.writeText(`${shareText} ${shareUrl}`);
        showSuccess(t.shareCopied);
      }
      await haptic('success');
      trackEvent('stats_shared', { total_sessions: stats.totalSessions });
    } catch {
      showError(t.shareFailed);
    } finally {
      setSharing(false);
    }
  };

  // Build heatmap grid: 12 columns (weeks) × 7 rows (Mon..Sun), oldest on left
  const heatmapGrid: Array<Array<{ date: string; count: number }>> = [];
  {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(end.getUTCDate() - (HEATMAP_DAYS - 1));
    // align start to Monday
    const startDay = start.getUTCDay() || 7; // Sun=7
    start.setUTCDate(start.getUTCDate() - (startDay - 1));

    const cur = new Date(start);
    while (cur.getTime() <= end.getTime()) {
      const weekCol: Array<{ date: string; count: number }> = [];
      for (let i = 0; i < 7; i++) {
        const iso = cur.toISOString().slice(0, 10);
        weekCol.push({ date: iso, count: heatmap[iso] || 0 });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      heatmapGrid.push(weekCol);
    }
  }

  const totalHeatmapCount = Object.values(heatmap).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen pb-24 bg-[#272D34] text-white">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold tracking-tight">{t.pageTitle}</h1>
          {stats && stats.totalSessions > 0 && (
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#3D4349] text-sm text-white hover:bg-[#404549] disabled:opacity-50"
              aria-label={t.shareStats}
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t.shareStats}</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">{t.loading}</div>
        ) : (
          <>
            {/* Section 1: Stats cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard value={stats?.totalSessions ?? 0} label={t.totalSessions} Icon={CalendarIcon} />
              <StatCard value={stats?.currentStreak ?? 0} label={`${t.currentStreak} (${t.weeks})`} Icon={Flame} />
              <StatCard value={stats?.sportsTried ?? 0} label={t.sportsTried} Icon={Activity} />
              <StatCard value={stats?.uniqueInstructors ?? 0} label={t.instructorsTrainedWith} Icon={Users} />
            </div>

            {/* Section 2: Training heatmap */}
            <section className="bg-[#3D4349] rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3">{t.heatmapTitle}</h2>
              <div className="overflow-x-auto">
                <div className="inline-flex gap-1">
                  {heatmapGrid.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.map((cell) => (
                        <div
                          key={cell.date}
                          title={`${cell.date} · ${cell.count}`}
                          className={`w-3 h-3 rounded-sm ${heatmapClass(cell.count)}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-400">{t.heatmapSummary(totalHeatmapCount)}</p>
            </section>

            {/* Section 3: Training history */}
            <section className="bg-[#3D4349] rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3">{t.historyTitle}</h2>
              {history.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">{t.noHistory}</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((entry) => {
                    const sportLabel = entry.sport
                      ? language === 'es'
                        ? sportTranslations[entry.sport]?.es || entry.sport
                        : sportTranslations[entry.sport]?.en || entry.sport
                      : '';
                    return (
                      <li
                        key={entry.session_id}
                        className="flex items-center gap-3 py-2 border-b border-[#272D34] last:border-b-0"
                      >
                        <Link href={`/session/${entry.session_id}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium truncate">
                            <span>{entry.title || sportLabel}</span>
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {entry.instructor?.name ? `${entry.instructor.name} · ` : ''}
                            {formatDayLabel(entry.date, language)}
                            {entry.start_time ? ` · ${entry.start_time.slice(0, 5)}` : ''}
                            {entry.location ? ` · ${entry.location}` : ''}
                          </div>
                        </Link>
                        <div className="flex-shrink-0 text-right">
                          {entry.user_rating ? (
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <Star
                                  key={n}
                                  size={12}
                                  className={
                                    n <= (entry.user_rating || 0)
                                      ? 'fill-[#F59E0B] text-[#F59E0B]'
                                      : 'fill-transparent text-gray-600'
                                  }
                                />
                              ))}
                            </div>
                          ) : (
                            <Link
                              href={`/session/${entry.session_id}`}
                              className="text-xs font-medium text-[#84cc16] hover:text-[#A3E635]"
                            >
                              {t.rateCta}
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Section 4: Milestones — reuses existing AchievementBadges */}
            {userId && (
              <section className="bg-[#3D4349] rounded-xl p-4">
                <h2 className="text-sm font-semibold mb-3">{t.milestonesTitle}</h2>
                <AchievementBadges userId={userId} isOwnProfile={true} />
              </section>
            )}

            {/* Invisible helper kept for share-card display name */}
            {userName && userAvatar && (
              <div aria-hidden="true" className="sr-only">
                <Image src={userAvatar} alt="" width={1} height={1} unoptimized />
                {userName}
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function StatCard({ value, label, Icon }: { value: number; label: string; Icon: LucideIcon }) {
  return (
    <div className="bg-[#3D4349] rounded-xl p-4 relative">
      <Icon className="absolute top-3 right-3 text-gray-500" size={16} />
      <p className="text-3xl font-extrabold text-[#84cc16]">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  );
}
