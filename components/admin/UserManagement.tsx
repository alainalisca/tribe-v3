import { Search, Calendar } from 'lucide-react';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type AdminUser = UserRow & { sessions_created: number; sessions_joined: number };

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
  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-white rounded shadow">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-[#C0E863]"
          />
        </div>
        <p className="text-xs text-stone-500 mt-1">{filteredUsers.length} users</p>
      </div>

      <div className="divide-y max-h-[500px] overflow-y-auto">
        {loading ? (
          <p className="text-center py-6 text-sm text-gray-500">Loading...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-center py-6 text-sm text-gray-500">No users found</p>
        ) : (
          filteredUsers.map((u) => (
            <div key={u.id} className={`p-3 ${u.banned ? 'bg-red-50' : ''}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#C0E863] flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden">
                  {u.avatar_url ? (
                    <img loading="lazy" src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    u.name?.[0]?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-bold text-[#272D34] truncate">{u.name || 'No name'}</p>
                    {u.banned && (
                      <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded flex-shrink-0">
                        BANNED
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
                  {new Date(u.created_at ?? '').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: '2-digit',
                  })}
                </span>
                <span className="flex items-center gap-1" title="Sessions created">
                  <span className="font-medium text-blue-600">{u.sessions_created ?? 0}</span> created
                </span>
                <span className="flex items-center gap-1" title="Sessions joined">
                  <span className="font-medium text-green-600">{u.sessions_joined ?? 0}</span> joined
                </span>
              </div>

              <div className="flex gap-2 ml-12">
                {u.banned ? (
                  <button
                    onClick={() => onUnban(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50"
                  >
                    {actionLoading === u.id ? 'Wait...' : 'Unban'}
                  </button>
                ) : (
                  <button
                    onClick={() => onBan(u.id)}
                    disabled={actionLoading === u.id}
                    className="flex-1 py-1.5 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 disabled:opacity-50"
                  >
                    {actionLoading === u.id ? 'Wait...' : 'Ban'}
                  </button>
                )}
                <button
                  onClick={() => onDelete(u.id)}
                  disabled={actionLoading === u.id}
                  className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600 disabled:opacity-50"
                >
                  {actionLoading === u.id ? 'Wait...' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
