import { useState } from 'react';
import Link from 'next/link';
import { Search, Calendar, ExternalLink } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useLanguage } from '@/lib/LanguageContext';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type AdminUser = UserRow & { sessions_created: number; sessions_joined: number };

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

interface UserManagementProps {
  users: AdminUser[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
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
  loading,
  actionLoading,
  onBan,
  onUnban,
  onDelete,
}: UserManagementProps) {
  const { language } = useLanguage();
  const [showBots, setShowBots] = useState(false);

  const botCount = users.filter((u) => isBotAccount(u.email)).length;

  const filteredUsers = users.filter((u) => {
    if (!showBots && isBotAccount(u.email)) return false;
    return (
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-xl shadow border border-stone-200 dark:border-tribe-mid">
      <div className="p-4 border-b border-stone-200 dark:border-tribe-mid">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
          <input
            type="text"
            placeholder={language === 'es' ? 'Buscar por nombre o correo...' : 'Search by name or email...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 dark:bg-tribe-mid border border-stone-200 dark:border-tribe-card rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-theme-primary placeholder-stone-400"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-stone-500 dark:text-gray-400">
            {filteredUsers.length} {language === 'es' ? 'usuarios' : 'users'}
          </p>
          {botCount > 0 && (
            <button
              onClick={() => setShowBots(!showBots)}
              className={`text-xs px-2 py-1 rounded font-medium transition ${
                showBots
                  ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                  : 'bg-stone-100 dark:bg-tribe-mid text-stone-500 dark:text-gray-400 hover:bg-stone-200'
              }`}
            >
              {showBots
                ? language === 'es'
                  ? `Ocultar bots (${botCount})`
                  : `Hide bots (${botCount})`
                : language === 'es'
                  ? `Mostrar bots (${botCount})`
                  : `Show bots (${botCount})`}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-stone-200 dark:divide-tribe-mid max-h-[70vh] overflow-y-auto">
        {loading ? (
          <p className="text-center py-8 text-sm text-stone-500 dark:text-gray-400">
            {language === 'es' ? 'Cargando...' : 'Loading...'}
          </p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-center py-8 text-sm text-stone-500 dark:text-gray-400">
            {language === 'es' ? 'No se encontraron usuarios' : 'No users found'}
          </p>
        ) : (
          filteredUsers.map((u) => (
            <div
              key={u.id}
              className={`p-4 transition ${u.banned ? 'bg-red-50 dark:bg-red-950/20' : 'hover:bg-stone-50 dark:hover:bg-tribe-mid/40'}`}
            >
              {/* Top row: avatar + name/email link to profile + role badges */}
              <Link
                href={`/profile/${u.id}`}
                className="flex items-start gap-3 mb-3 group"
                title={language === 'es' ? 'Ver perfil' : 'View profile'}
              >
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarImage loading="lazy" src={u.avatar_url || undefined} alt={`${u.name || 'User'} avatar`} />
                  <AvatarFallback className="bg-tribe-green text-base font-bold text-slate-900">
                    {u.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-tribe-dark dark:text-white truncate group-hover:underline">
                      {u.name || (language === 'es' ? 'Sin nombre' : 'No name')}
                    </p>
                    <ExternalLink className="w-3 h-3 text-stone-400 group-hover:text-tribe-green transition" />
                    {u.banned && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                        {language === 'es' ? 'BANEADO' : 'BANNED'}
                      </span>
                    )}
                    {u.is_admin && (
                      <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded flex-shrink-0">
                        ADMIN
                      </span>
                    )}
                    {u.is_instructor && (
                      <span className="px-1.5 py-0.5 bg-tribe-green text-slate-900 text-[10px] font-bold rounded flex-shrink-0">
                        {language === 'es' ? 'INSTRUCTOR' : 'INSTRUCTOR'}
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
                  <p className="text-xs text-stone-500 dark:text-gray-400 truncate mt-0.5">{u.email}</p>
                </div>
              </Link>

              {/* User stats row */}
              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500 dark:text-gray-400 mb-3 ml-15">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(u.created_at ?? '').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span title={language === 'es' ? 'Sesiones creadas' : 'Sessions created'}>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">{u.sessions_created ?? 0}</span>{' '}
                  {language === 'es' ? 'creadas' : 'created'}
                </span>
                <span title={language === 'es' ? 'Sesiones unidas' : 'Sessions joined'}>
                  <span className="font-semibold text-green-600 dark:text-green-400">{u.sessions_joined ?? 0}</span>{' '}
                  {language === 'es' ? 'unidas' : 'joined'}
                </span>
              </div>

              <div className="flex gap-2">
                {u.banned ? (
                  <button
                    onClick={() => onUnban(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                  >
                    {actionLoading === u.id
                      ? language === 'es'
                        ? 'Espera...'
                        : 'Wait...'
                      : language === 'es'
                        ? 'Desbanear'
                        : 'Unban'}
                  </button>
                ) : (
                  <button
                    onClick={() => onBan(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                  >
                    {actionLoading === u.id
                      ? language === 'es'
                        ? 'Espera...'
                        : 'Wait...'
                      : language === 'es'
                        ? 'Banear'
                        : 'Ban'}
                  </button>
                )}
                <button
                  onClick={() => onDelete(u.id)}
                  disabled={actionLoading === u.id}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition"
                >
                  {actionLoading === u.id
                    ? language === 'es'
                      ? 'Espera...'
                      : 'Wait...'
                    : language === 'es'
                      ? 'Eliminar'
                      : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
