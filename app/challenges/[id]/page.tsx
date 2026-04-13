'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import {
  fetchChallengeById,
  fetchChallengeLeaderboard,
  isInChallenge,
  joinChallenge,
  leaveChallenge,
  getUserChallengeProgress,
  ChallengeWithCreator,
  ChallengeParticipant,
} from '@/lib/dal/challenges';
import { sportTranslations } from '@/lib/translations';
import { ArrowLeft, Calendar, Users, Trophy, Loader, Heart } from 'lucide-react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';

const CHALLENGE_TYPE_LABELS = {
  session_count: 'Session Count',
  streak: 'Streak',
  sport_variety: 'Sport Variety',
  custom: 'Custom',
};

const CHALLENGE_TYPE_LABELS_ES = {
  session_count: 'Contador de sesiones',
  streak: 'Racha',
  sport_variety: 'Variedad de deportes',
  custom: 'Personalizado',
};

export default function ChallengePage() {
  const router = useRouter();
  const params = useParams();
  const { language } = useLanguage();
  const supabase = createClient();

  const challengeId = params.id as string;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<ChallengeWithCreator | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeParticipant[]>([]);
  const [isUserInChallenge, setIsUserInChallenge] = useState(false);
  const [userProgress, setUserProgress] = useState<ChallengeParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const t = {
    en: {
      back: 'Back',
      join: 'Join Challenge',
      leave: 'Leave Challenge',
      leaderboard: 'Leaderboard',
      yourProgress: 'Your Progress',
      daysLeft: (days: number) => `${days} days left`,
      createdBy: 'Created by',
      participants: 'athletes',
      rank: 'Rank',
      name: 'Name',
      progress: 'Progress',
      loading: 'Loading...',
      error: 'Error loading challenge',
    },
    es: {
      back: 'Atrás',
      join: 'Unirse al Reto',
      leave: 'Abandonar Reto',
      leaderboard: 'Tabla de Posiciones',
      yourProgress: 'Tu Progreso',
      daysLeft: (days: number) => `${days} días restantes`,
      createdBy: 'Creado por',
      participants: 'atletas',
      rank: 'Rango',
      name: 'Nombre',
      progress: 'Progreso',
      loading: 'Cargando...',
      error: 'Error al cargar reto',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;
  const typeLabels = language === 'es' ? CHALLENGE_TYPE_LABELS_ES : CHALLENGE_TYPE_LABELS;

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/auth/login');
          return;
        }

        setCurrentUserId(user.id);

        // Fetch challenge
        const challengeResult = await fetchChallengeById(supabase, challengeId);
        if (challengeResult.success && challengeResult.data) {
          setChallenge(challengeResult.data);
        }

        // Check if user is in challenge
        const inChallengeResult = await isInChallenge(supabase, challengeId, user.id);
        if (inChallengeResult.success) {
          setIsUserInChallenge(inChallengeResult.data ?? false);

          // Get user progress if in challenge
          if (inChallengeResult.data) {
            const progressResult = await getUserChallengeProgress(supabase, challengeId, user.id);
            if (progressResult.success && progressResult.data) {
              setUserProgress(progressResult.data);
            }
          }
        }

        // Fetch leaderboard
        const leaderboardResult = await fetchChallengeLeaderboard(supabase, challengeId);
        if (leaderboardResult.success && leaderboardResult.data) {
          setLeaderboard(leaderboardResult.data);
        }
      } catch (error) {
        console.error('Error loading challenge:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [supabase, router, challengeId]);

  const handleJoinChallenge = async () => {
    if (!currentUserId) return;

    setActionLoading(true);
    try {
      const result = await joinChallenge(supabase, challengeId, currentUserId);
      if (result.success) {
        setIsUserInChallenge(true);
        // Refresh leaderboard
        const leaderboardResult = await fetchChallengeLeaderboard(supabase, challengeId);
        if (leaderboardResult.success && leaderboardResult.data) {
          setLeaderboard(leaderboardResult.data);
        }
      }
    } catch (error) {
      console.error('Error joining challenge:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveChallenge = async () => {
    if (!currentUserId) return;

    if (!confirm(language === 'es' ? '¿Estás seguro?' : 'Are you sure?')) return;

    setActionLoading(true);
    try {
      const result = await leaveChallenge(supabase, challengeId, currentUserId);
      if (result.success) {
        setIsUserInChallenge(false);
        setUserProgress(null);
        // Refresh leaderboard
        const leaderboardResult = await fetchChallengeLeaderboard(supabase, challengeId);
        if (leaderboardResult.success && leaderboardResult.data) {
          setLeaderboard(leaderboardResult.data);
        }
      }
    } catch (error) {
      console.error('Error leaving challenge:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const daysLeft = challenge
    ? Math.ceil((new Date(challenge.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-tribe-green" />
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="min-h-screen bg-theme-page pb-12">
        <div className="max-w-2xl mx-auto p-4 text-center pt-20">
          <p className="text-theme-secondary">{strings.error}</p>
          <button onClick={() => router.back()} className="mt-4 text-tribe-green font-semibold hover:underline">
            {strings.back}
          </button>
        </div>
      </div>
    );
  }

  const progressPercent =
    challenge.target_value > 0 ? Math.min(((userProgress?.progress || 0) / challenge.target_value) * 100, 100) : 0;

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-tribe-green hover:opacity-75 transition"
          >
            <ArrowLeft className="h-5 w-5" />
            {strings.back}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Cover Banner */}
        <div className="h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-tribe-green to-[#8FD642] relative">
          {challenge.cover_image_url && (
            <Image src={challenge.cover_image_url} alt={challenge.title} fill className="object-cover" />
          )}
          <div className="absolute top-4 right-4">
            <span className="bg-slate-900/80 text-tribe-green text-xs font-semibold px-3 py-1 rounded-full">
              {typeLabels[challenge.challenge_type] || challenge.challenge_type}
            </span>
          </div>
        </div>

        {/* Title and Info */}
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-6 border border-stone-200 dark:border-gray-700 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-theme-primary mb-2">{challenge.title}</h1>
            {challenge.description && <p className="text-theme-secondary">{challenge.description}</p>}
          </div>

          {/* Meta Info */}
          <div className="flex flex-wrap gap-4 text-sm">
            {challenge.sport && (
              <div className="flex items-center gap-2">
                <span className="text-theme-secondary">
                  {(sportTranslations as Record<string, Record<string, string>>)[language === 'es' ? 'es' : 'en']?.[
                    challenge.sport
                  ] || challenge.sport}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 text-theme-secondary">
              <Calendar className="h-4 w-4" />
              <span>{strings.daysLeft(Math.max(0, daysLeft))}</span>
            </div>
            <div className="flex items-center gap-1 text-theme-secondary">
              <Users className="h-4 w-4" />
              <span>
                {challenge.participant_count} {strings.participants}
              </span>
            </div>
          </div>

          {/* Creator */}
          {challenge.creator && (
            <div className="pt-4 border-t border-stone-200 dark:border-gray-700">
              <p className="text-sm text-theme-secondary">
                {strings.createdBy} <span className="font-semibold text-theme-primary">{challenge.creator.name}</span>
              </p>
            </div>
          )}

          {/* Join/Leave Button */}
          <button
            onClick={isUserInChallenge ? handleLeaveChallenge : handleJoinChallenge}
            disabled={actionLoading}
            className={`w-full px-6 py-3 rounded-lg font-semibold transition ${
              isUserInChallenge
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200'
                : 'bg-tribe-green text-slate-900 hover:bg-tribe-green'
            } disabled:opacity-50`}
          >
            {actionLoading ? strings.loading : isUserInChallenge ? strings.leave : strings.join}
          </button>
        </div>

        {/* Your Progress (if joined) */}
        {isUserInChallenge && userProgress && (
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-6 border border-stone-200 dark:border-gray-700 space-y-4">
            <h2 className="text-lg font-bold text-theme-primary">{strings.yourProgress}</h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-theme-secondary">
                  {userProgress.progress} / {challenge.target_value}
                </span>
                <span className="text-tribe-green font-bold">{Math.round(progressPercent)}%</span>
              </div>

              <div className="w-full bg-stone-200 dark:bg-tribe-surface rounded-full h-4 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-tribe-green to-[#8FD642] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {userProgress.completed_at && (
                <div className="flex items-center gap-2 text-tribe-green font-semibold pt-2">
                  <Heart className="h-5 w-5 fill-tribe-green" />
                  {language === 'es' ? '¡Completado!' : 'Completed!'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-6 border border-stone-200 dark:border-gray-700 space-y-4">
          <h2 className="text-lg font-bold text-theme-primary flex items-center gap-2">
            <Trophy className="h-5 w-5 text-tribe-green" />
            {strings.leaderboard}
          </h2>

          {leaderboard.length === 0 ? (
            <p className="text-center text-theme-secondary py-8">
              {language === 'es' ? 'Sin atletas aún' : 'No athletes yet'}
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((participant, index) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-stone-50 dark:bg-tribe-surface hover:bg-stone-100 dark:hover:bg-[#4A515A] transition"
                >
                  {/* Rank Badge */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-tribe-green text-slate-900 flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>

                  {/* User Info */}
                  <div className="flex-1">
                    <p className="font-semibold text-theme-primary">{participant.user?.name || 'User'}</p>
                  </div>

                  {/* Progress */}
                  <div className="flex-shrink-0 text-right">
                    <p className="font-semibold text-tribe-green text-sm">
                      {participant.progress}/{challenge.target_value}
                    </p>
                    <p className="text-xs text-theme-secondary">
                      {Math.round((participant.progress / challenge.target_value) * 100)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
