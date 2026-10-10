'use client';

/**
 * Admin > Sessions > All sessions. Every session, newest first, searchable by
 * title, sport, place or host name, with a Delete action per row.
 *
 * Delete goes through POST /api/admin/sessions/[id]/delete. The confirmation
 * names the session and, for a repeating series, says plainly that the whole
 * series goes, because deleting one date alone would be recreated by the
 * recurring-sessions cron.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Trash2, Repeat } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/LanguageContext';
import { showError, showSuccess } from '@/lib/toast';
import { logError } from '@/lib/logger';
import {
  fetchAdminAllSessions,
  isSeriesSession,
  ADMIN_SESSIONS_PAGE_SIZE,
  type AdminSessionListItem,
} from '@/lib/dal/adminSessions';
import { deleteSessionErrorMessage, requestAdminSessionDelete } from '@/lib/adminDeleteRequests';

interface AdminSessionListProps {
  supabase: SupabaseClient;
}

export default function AdminSessionList({ supabase }: AdminSessionListProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [search, setSearch] = useState('');
  const [sessions, setSessions] = useState<AdminSessionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<AdminSessionListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // @supabase/ssr 0.0.10's createBrowserClient is not a singleton, and the admin
  // page calls createClient() on every render, so the prop's identity changes
  // whenever the parent re-renders. Pinned once so that is not a refetch.
  const clientRef = useRef(supabase);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(
      async () => {
        setLoading(true);
        const result = await fetchAdminAllSessions(clientRef.current, search);
        if (cancelled) return;
        if (!result.success) {
          logError(result.error, { action: 'AdminSessionList.load' });
          setLoadFailed(true);
          setSessions([]);
        } else {
          setLoadFailed(false);
          setSessions(result.data ?? []);
        }
        setLoading(false);
      },
      search ? 300 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [search]);

  async function confirmDelete() {
    const target = pending;
    if (!target) return;
    setPending(null);
    setDeletingId(target.id);
    const series = isSeriesSession(target);
    const result = await requestAdminSessionDelete(target.id, series ? 'series' : 'single');
    setDeletingId(null);
    if (!result.ok) {
      showError(deleteSessionErrorMessage(result.error, isEs));
      return;
    }
    const gone = new Set(result.deletedIds);
    setSessions((prev) => prev.filter((s) => !gone.has(s.id)));
    showSuccess(
      gone.size > 1
        ? isEs
          ? `Serie eliminada (${gone.size} sesiones)`
          : `Series deleted (${gone.size} sessions)`
        : isEs
          ? 'Sesión eliminada'
          : 'Session deleted'
    );
  }

  const label = (s: AdminSessionListItem) => s.title?.trim() || `${s.sport} @ ${s.location}`;

  const confirmMessage = (s: AdminSessionListItem): string => {
    const people = s.current_participants ?? 0;
    const lines: string[] = [];
    if (isSeriesSession(s)) {
      lines.push(
        isEs
          ? `"${label(s)}" es parte de una serie que se repite. Se eliminará la serie completa, con todas sus fechas. Si solo borras una fecha, la app la vuelve a crear.`
          : `"${label(s)}" is part of a repeating series. The whole series will be deleted, every date. Deleting one date alone would be recreated by the app.`
      );
    } else {
      lines.push(isEs ? `Se eliminará "${label(s)}" para siempre.` : `"${label(s)}" will be permanently deleted.`);
    }
    if (people > 0) {
      lines.push(
        isEs
          ? `${people} ${people === 1 ? 'persona inscrita no será notificada' : 'personas inscritas no serán notificadas'}. Si es una sesión real, cancélala en vez de eliminarla.`
          : `${people} ${people === 1 ? 'person who joined will' : 'people who joined will'} not be notified. For a real session, cancel it instead.`
      );
    }
    lines.push(isEs ? 'Esto no se puede deshacer.' : 'This cannot be undone.');
    return lines.join(' ');
  };

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-xl shadow border border-tribe-dark/10 dark:border-tribe-mid">
      <div className="p-4 border-b border-tribe-dark/10 dark:border-tribe-mid space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tribe-dark-80 dark:text-tribe-dark-60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isEs ? 'Buscar por título, deporte, lugar o anfitrión...' : 'Search by title, sport, place or host...'
            }
            className="w-full pl-9 pr-3 py-2 text-base bg-tribe-dark/[0.04] dark:bg-tribe-mid border border-tribe-dark/10 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary placeholder-tribe-dark-80"
          />
        </div>
        <p className="text-xs text-tribe-dark-80 dark:text-tribe-dark-60">
          {sessions.length} {isEs ? 'sesiones, las más recientes primero' : 'sessions, newest first'}
          {sessions.length >= ADMIN_SESSIONS_PAGE_SIZE &&
            (isEs
              ? ` (primeras ${ADMIN_SESSIONS_PAGE_SIZE}, acota la búsqueda)`
              : ` (first ${ADMIN_SESSIONS_PAGE_SIZE}, narrow the search)`)}
        </p>
      </div>

      <div className="divide-y divide-tribe-dark/10 dark:divide-tribe-mid">
        {loading ? (
          <p className="p-8 text-center text-sm text-tribe-dark-80 dark:text-tribe-dark-60">
            {isEs ? 'Cargando sesiones...' : 'Loading sessions...'}
          </p>
        ) : loadFailed ? (
          <p className="p-8 text-center text-sm text-tribe-dark-80 dark:text-tribe-dark-60">
            {isEs ? 'No pudimos cargar las sesiones. Recarga la página.' : 'Could not load sessions. Reload the page.'}
          </p>
        ) : sessions.length === 0 ? (
          <p className="p-8 text-center text-sm text-tribe-dark-80 dark:text-tribe-dark-60">
            {isEs ? 'Ninguna sesión coincide' : 'No sessions match'}
          </p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <Link href={`/session/${s.id}`} className="min-w-0 flex-1 group">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-semibold text-tribe-dark dark:text-white truncate group-hover:underline">
                    {label(s)}
                  </span>
                  {isSeriesSession(s) && (
                    <Repeat
                      aria-label={isEs ? 'Serie' : 'Series'}
                      className="w-3.5 h-3.5 flex-shrink-0 text-tribe-dark-80"
                    />
                  )}
                  {s.status === 'cancelled' && (
                    <span className="px-1.5 py-px border border-tribe-dark-80 text-tribe-dark-80 text-[10px] font-bold rounded flex-shrink-0">
                      {isEs ? 'CANCELADA' : 'CANCELLED'}
                    </span>
                  )}
                  {s.is_paid && (
                    <span className="px-1.5 py-px bg-tribe-dark text-white text-[10px] font-bold rounded flex-shrink-0">
                      {isEs ? 'PAGA' : 'PAID'}
                    </span>
                  )}
                </div>
                <div className="text-[11px] leading-tight text-tribe-dark-80 dark:text-tribe-dark-60 truncate">
                  {s.creator?.name || (isEs ? 'Anfitrión desconocido' : 'Unknown host')} ·{' '}
                  {new Date(s.date + 'T00:00:00').toLocaleDateString(isEs ? 'es-CO' : 'en-US')}{' '}
                  {s.start_time?.slice(0, 5)} · {s.current_participants ?? 0} {isEs ? 'inscritos' : 'joined'}
                </div>
              </Link>
              <button
                onClick={() => setPending(s)}
                disabled={deletingId === s.id}
                aria-label={isEs ? `Eliminar ${label(s)}` : `Delete ${label(s)}`}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-red-700 text-white hover:bg-red-800 disabled:opacity-50 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deletingId === s.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Eliminar' : 'Delete'}
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending && isSeriesSession(pending)
            ? isEs
              ? 'Eliminar serie completa'
              : 'Delete whole series'
            : isEs
              ? 'Eliminar sesión'
              : 'Delete session'
        }
        message={pending ? confirmMessage(pending) : ''}
        confirmLabel={isEs ? 'Eliminar' : 'Delete'}
        cancelLabel={isEs ? 'Cancelar' : 'Cancel'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
