import { useState } from 'react';
import Link from 'next/link';
import { Search, MoreHorizontal } from 'lucide-react';
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
}: UserManagementProps) {
  const { language } = useLanguage();
  const isEs = language === 'es';
  const [showBots, setShowBots] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

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
        : 'bg-tribe-dark/[0.06] dark:bg-tribe-mid text-tribe-dark-80 dark:text-tribe-dark-60 hover:bg-tribe-dark/10 dark:hover:bg-tribe-card'
    }`;

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-xl shadow border border-tribe-dark/10 dark:border-tribe-mid">
      <div className="p-4 border-b border-tribe-dark/10 dark:border-tribe-mid space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tribe-dark-80 dark:text-tribe-dark-60" />
            <input
              type="text"
              placeholder={isEs ? 'Buscar en TODOS los usuarios...' : 'Search ALL users...'}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-tribe-dark/[0.04] dark:bg-tribe-mid border border-tribe-dark/10 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary placeholder-tribe-dark-80"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as AdminUserSort)}
            aria-label={isEs ? 'Ordenar por' : 'Sort by'}
            className="py-2 px-3 text-sm bg-tribe-dark/[0.04] dark:bg-tribe-mid border border-tribe-dark/10 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary"
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

        <div className="flex items-center justify-between text-xs text-tribe-dark-80 dark:text-tribe-dark-60">
          <span>
            {visibleUsers.length} {isEs ? 'usuarios' : 'users'}
            {users.length >= 100 && (
              <span className="ml-1 text-tribe-dark-80 dark:text-tribe-dark-60">
                {isEs ? '(primeros 100 — acota la búsqueda)' : '(first 100 — narrow the search)'}
              </span>
            )}
          </span>
          <span className="text-[11px] text-tribe-dark-80 dark:text-tribe-dark-60 tabular-nums">
            {isEs ? 'visto · creadas/unidas/completadas' : 'seen · created/joined/completed'}
          </span>
          {botCount > 0 && (
            <button
              onClick={() => setShowBots((v) => !v)}
              className="underline hover:text-tribe-dark dark:hover:text-white"
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

      <div className="divide-y divide-tribe-dark/10 dark:divide-tribe-mid">
        {loading ? (
          <div className="p-8 text-center text-sm text-tribe-dark-80 dark:text-tribe-dark-60">
            {isEs ? 'Cargando usuarios...' : 'Loading users...'}
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-tribe-dark-80 dark:text-tribe-dark-60">
            {isEs ? 'Ningún usuario coincide' : 'No users match'}
          </div>
        ) : (
          visibleUsers.map((u) => {
            // Badge the exception, not the rule. MEASURED on production
            // 2026-09-14 over 91 live rows: 24 instructors (26%), 67 athletes
            // (74%), 0 null, 10 test accounts (11%), 0 banned. Athletes are the
            // majority, so THEY get no mark; the instructor role is a quiet text
            // label, and only genuinely unusual states get a pill.
            const role = u.is_instructor ? (isEs ? 'Instructor' : 'Instructor') : null;
            const menuOpen = openMenu === u.id;
            return (
              <div
                key={u.id}
                className={
                  u.banned
                    ? 'bg-tribe-dark/5 dark:bg-tribe-dark/40'
                    : 'hover:bg-tribe-dark/[0.03] dark:hover:bg-tribe-mid/40'
                }
              >
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <Link href={`/profile/${u.id}`} className="flex items-center gap-2.5 min-w-0 flex-1 group">
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarImage loading="lazy" src={u.avatar_url || undefined} alt={`${u.name || 'User'} avatar`} />
                      <AvatarFallback className="text-xs">{u.name?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-tribe-dark dark:text-white truncate group-hover:underline">
                          {u.name || (isEs ? 'Sin nombre' : 'No name')}
                        </span>
                        {u.banned && (
                          <span className="px-1.5 py-px bg-tribe-dark text-white dark:bg-white dark:text-tribe-dark text-[10px] font-bold rounded flex-shrink-0 tracking-wide">
                            {isEs ? 'BANEADO' : 'BANNED'}
                          </span>
                        )}
                        {u.is_admin && (
                          <span className="px-1.5 py-px bg-tribe-green text-tribe-dark text-[10px] font-bold rounded flex-shrink-0 tracking-wide">
                            ADMIN
                          </span>
                        )}
                        {u.is_test_account && (
                          <span className="px-1.5 py-px border border-tribe-dark-80 text-tribe-dark-80 dark:border-tribe-dark-60 dark:text-tribe-dark-60 text-[10px] font-bold rounded flex-shrink-0 tracking-wide">
                            TEST
                          </span>
                        )}
                        {isBotAccount(u.email) && (
                          <span className="px-1.5 py-px border border-tribe-dark-80 text-tribe-dark-80 dark:border-tribe-dark-60 dark:text-tribe-dark-60 text-[10px] rounded flex-shrink-0">
                            BOT
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] leading-tight text-tribe-dark-80 dark:text-tribe-dark-60 truncate">
                        {role && <span className="font-medium">{role} · </span>}
                        {u.email}
                      </div>
                    </div>
                  </Link>

                  {/* Signals. Right-aligned, two short lines, legend in the header. */}
                  <div className="text-[11px] leading-tight text-right text-tribe-dark-80 dark:text-tribe-dark-60 flex-shrink-0 tabular-nums">
                    <div className={u.last_login_at ? '' : 'text-tribe-dark-60 dark:text-tribe-dark-80'}>
                      {lastSeenLabel(u.last_login_at, language)}
                    </div>
                    <div>
                      {u.sessions_created ?? 0}/{u.sessions_joined ?? 0}/{u.sessions_completed ?? 0}
                    </div>
                  </div>

                  <button
                    onClick={() => setOpenMenu(menuOpen ? null : u.id)}
                    aria-label={isEs ? 'Acciones' : 'Actions'}
                    aria-expanded={menuOpen}
                    className="p-1.5 -mr-1 rounded text-tribe-dark-80 hover:bg-tribe-dark/10 dark:text-tribe-dark-60 dark:hover:bg-tribe-mid flex-shrink-0"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>

                {menuOpen && (
                  <div className="px-3 pb-2 flex items-center gap-2">
                    {u.banned ? (
                      <button
                        onClick={() => onUnban(u.id)}
                        disabled={actionLoading === u.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-tribe-green text-tribe-dark hover:bg-tribe-green-100 disabled:opacity-50 transition"
                      >
                        {actionLoading === u.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Desbanear' : 'Unban'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onBan(u.id)}
                        disabled={actionLoading === u.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-tribe-dark text-white hover:bg-tribe-dark-80 disabled:opacity-50 transition"
                      >
                        {actionLoading === u.id ? (isEs ? 'Espera...' : 'Wait...') : isEs ? 'Banear' : 'Ban'}
                      </button>
                    )}
                    {/* Delete is NOT here. It gates on ADMIN_EMAILS while /admin
                        gates on is_app_admin(), so it 403s silently for a DB
                        admin who is not on the list. Removing it from the list
                        is the interim mitigation until SEC-03; it returns in the
                        detail view (ADMIN-02) behind a confirmation. */}
                    <span className="text-[11px] text-tribe-dark-80 dark:text-tribe-dark-60">
                      {isEs ? 'Eliminar se mueve a la vista de detalle' : 'Delete moves to the detail view'}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
