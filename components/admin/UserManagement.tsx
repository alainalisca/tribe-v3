import { useState } from 'react';
import { Search, Calendar } from 'lucide-react';
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
    <div className="bg-white dark:bg-tribe-surface rounded shadow">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder={language === 'es' ? 'Buscar por nombre o correo...' : 'Search by name or email...'}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-tribe-green-light"
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-stone-500">
            {filteredUsers.length} {language === 'es' ? 'usuarios' : 'users'}
          </p>
          {botCount > 0 && (
            <button
              onClick={() => setShowBots(!showBots)}
              className={`text-xs px-2 py-0.5 rounded ${showBots ? 'bg-orange-100 text-orange-700' : 'bg-stone-100 text-stone-500'}`}
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

      <div className="divide-y max-h-[500px] overflow-y-auto">
        {loading ? (
          <p className="text-center py-6 text-sm text-gray-500">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-center py-6 text-sm text-gray-500">
            {language === 'es' ? 'No se encontraron usuarios' : 'No users found'}
          </p>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className={`p-3 ${u.banned ? 'bg-red-50' : ''}`}>
              <div className="flex items-start gap-2 mb-2">
                <Avatar className="w-10 h-10 flex-shrink-0">
                  <AvatarImage loading="lazy" src={u.avatar_url || undefined} alt={`${u.name || 'User'} avatar`} />
                  <AvatarFallback className="bg-tribe-green-light text-sm font-bold">
                    {u.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-bold text-tribe-dark truncate">
                      {u.name || (language === 'es' ? 'Sin nombre' : 'No name')}
                    </p>
                    {u.banned && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded flex-shrink-0">
                        {language === 'es' ? 'BANEADO' : 'BANNED'}
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
                  <p className="text-xs text-stone-500 truncate">{u.email}</p>
                </div>
              </div>

              {/* User stats row */}
              <div className="flex items-center gap-3 text-xs text-stone-500 mb-2 ml-12">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(u.created_at ?? '').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </span>
                <span
                  className="flex items-center gap-1"
                  title={language === 'es' ? 'Sesiones creadas' : 'Sessions created'}
                >
                  <span className="font-medium text-blue-600">{u.sessions_created ?? 0}</span>{' '}
                  {language === 'es' ? 'creadas' : 'created'}
                </span>
                <span
                  className="flex items-center gap-1"
                  title={language === 'es' ? 'Sesiones unidas' : 'Sessions joined'}
                >
                  <span className="font-medium text-green-600">{u.sessions_joined ?? 0}</span>{' '}
                  {language === 'es' ? 'unidas' : 'joined'}
                </span>
              </div>

              <div className="flex gap-2 ml-12">
                {u.banned ? (
                  <button
                    onClick={() => onUnban(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50"
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
                    className="flex-1 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
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
                  className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
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
