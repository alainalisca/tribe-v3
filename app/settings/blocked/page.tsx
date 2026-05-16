'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ShieldOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import { listBlockedUsers, type BlockedUserWithProfile } from '@/lib/dal/blockedUsers';
import { showError, showSuccess } from '@/lib/toast';
import { haptic } from '@/lib/haptics';

export default function BlockedUsersPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<BlockedUserWithProfile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const t = {
    title: language === 'es' ? 'Usuarios Bloqueados' : 'Blocked Users',
    empty:
      language === 'es'
        ? 'No has bloqueado a nadie. Las personas que bloquees aparecerán aquí.'
        : 'You have not blocked anyone. People you block will appear here.',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    unblock: language === 'es' ? 'Desbloquear' : 'Unblock',
    unblocking: language === 'es' ? 'Desbloqueando…' : 'Unblocking…',
    unblocked: language === 'es' ? 'Usuario desbloqueado' : 'User unblocked',
    unblockError: language === 'es' ? 'No se pudo desbloquear' : 'Could not unblock',
    blockedOn: language === 'es' ? 'Bloqueado el' : 'Blocked on',
    explainer:
      language === 'es'
        ? 'No podrán enviarte solicitudes de conexión. No verán que los bloqueaste.'
        : "They can't send you connection requests. They don't see that you blocked them.",
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth?returnTo=/settings/blocked/');
        return;
      }
      const res = await listBlockedUsers(supabase);
      if (cancelled) return;
      if (res.success && res.data) {
        setRows(res.data);
      } else {
        setRows([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function handleUnblock(blockedUserId: string) {
    setBusyId(blockedUserId);
    try {
      const res = await fetch('/api/users/unblock/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: blockedUserId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        showError(data.error || t.unblockError);
        return;
      }
      await haptic('success');
      showSuccess(t.unblocked);
      setRows((current) => (current ?? []).filter((r) => r.blocked_user_id !== blockedUserId));
    } catch {
      showError(t.unblockError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen pb-24 bg-white dark:bg-tribe-dark text-stone-900 dark:text-white">
      <div className="max-w-xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-2">
          <ShieldOff className="w-5 h-5 text-tribe-green" />
          <h1 className="text-2xl font-extrabold">{t.title}</h1>
        </div>
        <p className="text-sm text-stone-600 dark:text-gray-400 leading-relaxed">{t.explainer}</p>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.loading}</p>
        ) : !rows || rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const profile = row.blocked_user;
              const name = profile?.name ?? 'Unknown user';
              const avatar = profile?.avatar_url ?? null;
              const blockedAt = new Date(row.created_at).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
              return (
                <li key={row.id} className="bg-stone-100 dark:bg-tribe-surface rounded-xl p-4 flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-full bg-stone-300 dark:bg-tribe-mid overflow-hidden flex-shrink-0">
                    {avatar ? (
                      <Image src={avatar} alt={`${name} avatar`} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-stone-500 dark:text-gray-400">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-stone-500 dark:text-gray-400 mt-0.5">
                      {t.blockedOn} {blockedAt}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblock(row.blocked_user_id)}
                    disabled={busyId === row.blocked_user_id}
                    className="px-3 py-1.5 rounded-lg bg-tribe-green text-tribe-dark text-xs font-bold hover:bg-tribe-green-light transition disabled:opacity-50 flex-shrink-0"
                  >
                    {busyId === row.blocked_user_id ? t.unblocking : t.unblock}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
