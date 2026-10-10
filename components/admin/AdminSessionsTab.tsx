'use client';

/**
 * Admin > Sessions. Two views:
 *  - All sessions (default): every session, searchable, with Delete.
 *  - Photo review: the original needs-attention queue (SessionManagement),
 *    unchanged, for verifying session photos.
 *
 * The photo queue used to be the only view, and it shows only unverified or
 * cancelled sessions that have photos, so it was usually empty and there was
 * no way to reach an ordinary session from the admin panel.
 */
import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLanguage } from '@/lib/LanguageContext';
import AdminSessionList from './AdminSessionList';
import SessionManagement from './SessionManagement';
import type { AdminSession } from '@/app/admin/types';

type View = 'all' | 'review';

interface AdminSessionsTabProps {
  supabase: SupabaseClient;
  reviewSessions: AdminSession[];
  reviewLoading: boolean;
  onLoadReview: () => void;
  onVerify: (sessionId: string) => void;
  onUnverify: (sessionId: string) => void;
}

export default function AdminSessionsTab({
  supabase,
  reviewSessions,
  reviewLoading,
  onLoadReview,
  onVerify,
  onUnverify,
}: AdminSessionsTabProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [view, setView] = useState<View>('all');

  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
      active
        ? 'bg-tribe-green text-slate-900'
        : 'bg-tribe-dark/[0.06] dark:bg-tribe-mid text-tribe-dark-80 dark:text-tribe-dark-60 hover:bg-tribe-dark/10'
    }`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setView('all')} className={chip(view === 'all')}>
          {isEs ? 'Todas las sesiones' : 'All sessions'}
        </button>
        <button
          onClick={() => {
            setView('review');
            onLoadReview();
          }}
          className={chip(view === 'review')}
        >
          {isEs ? 'Revisión de fotos' : 'Photo review'}
        </button>
      </div>
      {view === 'all' ? (
        <AdminSessionList supabase={supabase} />
      ) : (
        <SessionManagement
          sessions={reviewSessions}
          loading={reviewLoading}
          language={language}
          onVerify={onVerify}
          onUnverify={onUnverify}
        />
      )}
    </div>
  );
}
