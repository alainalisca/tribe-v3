import { useState } from 'react';
import Link from 'next/link';
import { Search, Calendar, ExternalLink } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLanguage } from '@/lib/LanguageContext';
import { lastSeenLabel } from '@/lib/lastSeen';
import { ADMIN_USER_FILTERS, type AdminUserFilter, type AdminUserSort } from '@/lib/dal/admin';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
/** is_test_account is `boolean NOT NULL DEFAULT false` in production (migration
 *  052) but is ABSENT from lib/database.types.ts -- the generated types are stale
 *  against the live schema. Declared here so this component can read the column
 *  the DAL now selects; regenerating the types is its own change, not this one. */
type AdminUser = UserRow & {
  sessions_created: number;
  sessions_joined: number;
  is_test_account?: boolean | null;
};

const BOT_EMAIL_PATTERNS = ['cloudtestlabaccounts', 'cloudtestlab'];

function isBotAccount(email: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return BOT_EMAIL_PATTERNS.some((p) => lower.includes(p));
}

function isAppleRelay(email: string | null): boolean {
  if (!email) return false;
  return email.toLowerCase().includes('@privaterelay.appleid.com');
}

const FILTER_LABELS: Record<AdminUserFilter, { en: string; es: string }> = {
  all: { en: 'All', es: 'Todos' },
  instructors: { en: 'Instructors', es: 'Instructores' },
  athletes: { en: 'Athletes', es: 'Atletas' },
  test: { en: 'Test accounts', es: 'Cuentas de prueba' },
  banned: { en: 'Banned', es: 'Baneados' },
  new: { en: 'New this week', es: 'Nuevos esta semana' },
};

const SORT_LABELS: Record<AdminUserSort, { en: string; es: string }> = {
  newest: { en: 'Newest', es: 'Más recientes' },
  last_active: { en: 'Last active', es: 'Actividad reciente' },
  most_hosted: { en: 'Most sessions hosted', es: 'Más sesiones creadas' },
};

interface UserManagementProps {
  users: AdminUser[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filter: AdminUserFilter;
  onFilterChange: (filter: AdminUserFilter) => void;
  sort: AdminUserSort;
  onSortChange: (sort: AdminUserSort) => void;
  loading: boolean;
  actionLoading: string | null;
  onBan: (userId: string) => void;
  onUnban: (userId: string) => void;
  onDelete: (userId: string) => void;
}

export default function UserManagement({
  users,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  loading,
  actionLoading,
  onBan,
  onUnban,
  onDelete,
}: UserManagementProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [showBots, setShowBots] = useState(false);

  const botCount = users.filter((u) => isBotAccount(u.email)).length;

  // ADMIN-01: the ONLY client-side narrowing left is the bot toggle, which hides
  // rows already on screen. Search, filter and sort all ran in the query. The
  // previous version filtered `users` by searchQuery here, over a page of at most
  // 100 rows -- so searching for anyone outside the newest 100 returned nothing
  // and read as "that user does not exist".
  const visibleUsers = showBots ? users : users.filter((u) => !isBotAccount(u.email));

  const chip = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
      active
        ? 'bg-tribe-green text-slate-900'
        : 'bg-stone-100 dark:bg-tribe-mid text-stone-600 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-tribe-card'
    }`;

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-xl shadow border border-stone-200 dark:border-tribe-mid">
      <div className="p-4 border-b border-stone-200 dark:border-tribe-mid space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder={isEs ? 'Buscar en TODOS los usuarios...' : 'Search ALL users...'}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary placeholder-stone-400"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as AdminUserSort)}
            aria-label={isEs ? 'Ordenar por' : 'Sort by'}
            className="py-2 px-3 text-sm bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary"
          >
            {(Object.keys(SORT_LABELS) as AdminUserSort[]).map((s) => (
              <option key={s} value={s}>
                {isEs ? SORT_LABELS[s].es : SORT_LABELS[s].en}
              </option>
            ))}
          </select>
        </div>

        <div
          className="flex gap-2 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {ADMIN_USER_FILTERS.map((f) => (
            <button key={f} onClick={() => onFilterChange(f)} className={chip(filter === f)}>
              {isEs ? FILTER_LABELS[f].es : FILTER_LABELS[f].en}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-stone-500 dark:text-gray-400">
          <span>
            {visibleUsers.length} {isEs ? 'usuarios' : 'users'}
            {users.length >= 100 && (
              <span className="ml-1 text-stone-400">
                {isEs ? '(primeros 100 — acota la búsqueda)' : '(first 100 — narrow the search)'}
              </span>
            )}
          </span>
          {botCount > 0 && (
            <button
              onClick={() => setShowBots((v) => !v)}
              className="underline hover:text-stone-700 dark:hover:text-white"
            >
              {showBots
                ? isEs
                  ? `Ocultar ${botCount} bots`
                  : `Hide ${botCount} bots`
                : isEs
                  ? `Mostrar ${botCount} bots`
                  : `Show ${botCount} bots`}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-stone-200 dark:divide-tribe-mid">
        {loading ? (
          <div className="p-8 text-center text-sm text-stone-500 dark:text-gray-400">
            {isEs ? 'Cargando usuarios...' : 'Loading users...'}
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-stone-500 dark:text-gray-400">
            {isEs ? 'Ningún usuario coincide' : 'No users match'}
          </div>
        ) : (
          visibleUsers.map((u) => (
            <div
              key={u.id}
              className={`px-4 py-3 transition ${u.banned ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-stone-50 dark:hover:bg-tribe-mid/40'}`}
            >
              {/* Compact single row from sm up; stacked card below it. */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <Link href={`/profile/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1 group">
                  <Avatar className="w-9 h-9 flex-shrink-0">
                    <AvatarImage loading="lazy" src={u.avatar_url || undefined} alt={`${u.name || 'User'} avatar`} />
                    <AvatarFallback>{u.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold text-tribe-dark dark:text-white truncate group-hover:underline">
                        {u.name || (isEs ? 'Sin nombre' : 'No name')}
                      </p>
                      <ExternalLink className="w-3 h-3 text-stone-400 group-hover:text-tribe-green transition flex-shrink-0" />
                      {u.banned && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                          {isEs ? 'BANEADO' : 'BANNED'}
                        </span>
                      )}
                      {u.is_admin && (
                        <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                          ADMIN
                        </span>
                      )}
                      {u.is_test_account && (
                        <span className="px-1.5 py-0.5 bg-purple-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                          TEST
                        </span>
                      )}
                      {u.is_instructor && (
                        <span className="px-1.5 py-0.5 bg-tribe-green text-slate-900 text-[10px] font-bold rounded flex-shrink-0">
                          INSTRUCTOR
                        </span>
                      )}
                      {isBotAccount(u.email) && (
                        <span className="px-1.5 py-0.5 bg-orange-400 text-white text-[10px] rounded flex-shrink-0">
                          BOT
                        </span>
                      )}
                      {isAppleRelay(u.email) && (
                        <span className="px-1.5 py-0.5 bg-stone-500 text-white text-[10px] rounded flex-shrink-0">
                          Apple Relay
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 dark:text-gray-400 truncate">{u.email}</p>
                  </div>
                </Link>

                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-gray-400 sm:flex-nowrap sm:justify-end">
                  <span className="flex items-center gap-1" title={isEs ? 'Última sesión iniciada' : 'Last login'}>
                    <span className="text-stone-400">{isEs ? 'visto' : 'seen'}</span>
                    <span
                      className={`font-semibold ${u.last_login_at ? 'text-stone-700 dark:text-gray-200' : 'text-stone-400'}`}
                    >
                      {lastSeenLabel(u.last_login_at, language)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1" title={isEs ? 'Se unió' : 'Joined'}>
                    <Calendar className="w-3 h-3" />
                    {new Date(u.created_at ?? '').toLocaleDateString(isEs ? 'es-CO' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span title={isEs ? 'Sesiones creadas' : 'Sessions created'}>
                    <span className="font-semibold text-blue-600 dark:text-blue-400">{u.sessions_created ?? 0}</span>{' '}
                    {isEs ? 'creadas' : 'created'}
                  </span>
                  <span title={isEs ? 'Sesiones unidas' : 'Sessions joined'}>
                    <span className="font-semibold text-green-600 dark:text-green-400">{u.sessions_joined ?? 0}</span>{' '}
                    {isEs ? 'unidas' : 'joined'}
                  </span>
                  <span title={isEs ? 'Sesiones completadas' : 'Sessions completed'}>
                    <span className="font-semibold text-stone-700 dark:text-gray-200">{u.sessions_completed ?? 0}</span>{' '}
                    {isEs ? 'completadas' : 'completed'}
                  </span>
                </div>

                <div className="flex gap-2 sm:flex-shrink-0">
                  {u.banned ? (
                    <button
                      onClick={() => onUnban(u.id)}
                      disabled={actionLoading === u.id}
                      className="flex-1 sm:flex-none sm:px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                    >
                      {actionLoading === u.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Desbanear' : 'Unban'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onBan(u.id)}
                      disabled={actionLoading === u.id}
                      className="flex-1 sm:flex-none sm:px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                    >
                      {actionLoading === u.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Banear' : 'Ban'}
                    </button>
                  )}
                  {/* ADMIN-01: delete left EXACTLY as found, on purpose. It gates on
                      the ADMIN_EMAILS allowlist while /admin gates on is_app_admin(),
                      so it 403s silently for a DB admin who is not on the list.
                      Flagged, not fixed here -- see SEC-03. */}
                  <button
                    onClick={() => onDelete(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 sm:flex-none sm:px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                  >
                    {actionLoading === u.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Eliminar' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
