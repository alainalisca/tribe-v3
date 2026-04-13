/** Page: /connections — Manage training partner connections and requests */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, MessageCircle, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import {
  fetchConnections,
  fetchPendingRequests,
  acceptConnection,
  declineConnection,
  removeConnection,
} from '@/lib/dal/connections';
import type { ConnectedUser, PendingRequest } from '@/lib/dal/connections';

type Tab = 'connections' | 'requests';

export default function ConnectionsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<Tab>('connections');
  const [userId, setUserId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectedUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setUserId(user.id);
    };

    getUser();
  }, [supabase, router]);

  // Fetch connections and requests
  useEffect(() => {
    const fetch = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);

      const [connectionsResult, requestsResult] = await Promise.all([
        fetchConnections(supabase, userId),
        fetchPendingRequests(supabase, userId),
      ]);

      if (connectionsResult.success && connectionsResult.data) {
        setConnections(connectionsResult.data);
      } else {
        setError(connectionsResult.error || null);
      }

      if (requestsResult.success && requestsResult.data) {
        setPendingRequests(requestsResult.data);
      }

      setLoading(false);
    };

    fetch();
  }, [supabase, userId]);

  const handleAccept = async (connectionId: string) => {
    setActionLoading(connectionId);

    const result = await acceptConnection(supabase, connectionId);

    if (result.success) {
      // Refresh lists
      if (userId) {
        const connectionsResult = await fetchConnections(supabase, userId);
        const requestsResult = await fetchPendingRequests(supabase, userId);

        if (connectionsResult.success && connectionsResult.data) {
          setConnections(connectionsResult.data);
        }
        if (requestsResult.success && requestsResult.data) {
          setPendingRequests(requestsResult.data);
        }
      }
    }

    setActionLoading(null);
  };

  const handleDecline = async (connectionId: string) => {
    setActionLoading(connectionId);

    const result = await declineConnection(supabase, connectionId);

    if (result.success) {
      if (userId) {
        const requestsResult = await fetchPendingRequests(supabase, userId);
        if (requestsResult.success && requestsResult.data) {
          setPendingRequests(requestsResult.data);
        }
      }
    }

    setActionLoading(null);
  };

  const handleRemove = async (connectionId: string) => {
    setActionLoading(connectionId);

    const result = await removeConnection(supabase, connectionId);

    if (result.success) {
      if (userId) {
        const connectionsResult = await fetchConnections(supabase, userId);
        if (connectionsResult.success && connectionsResult.data) {
          setConnections(connectionsResult.data);
        }
      }
    }

    setActionLoading(null);
  };

  const t = (key: string): string => {
    const translations: Record<string, Record<string, string>> = {
      connections: {
        en: 'Connections',
        es: 'Conexiones',
      },
      requests: {
        en: 'Requests',
        es: 'Solicitudes',
      },
      noConnections: {
        en: 'No connections yet',
        es: 'Sin conexiones todavía',
      },
      noConnectionsDesc: {
        en: 'Train with others to start connecting and messaging',
        es: 'Entrena con otros para conectar y mensajearte',
      },
      noRequests: {
        en: 'No pending requests',
        es: 'Sin solicitudes pendientes',
      },
      accept: {
        en: 'Accept',
        es: 'Aceptar',
      },
      decline: {
        en: 'Decline',
        es: 'Rechazar',
      },
      message: {
        en: 'Message',
        es: 'Mensaje',
      },
      remove: {
        en: 'Remove',
        es: 'Eliminar',
      },
      findSessions: {
        en: 'Find Sessions',
        es: 'Encontrar Sesiones',
      },
    };

    return translations[key]?.[language] || key;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
          <div className="max-w-2xl mx-auto h-14 flex items-center px-4 gap-3">
            <button onClick={() => router.back()} className="flex-shrink-0">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
            <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('connections')}</h1>
          </div>
        </div>
        <div className="pt-header max-w-2xl mx-auto p-4">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="dark:bg-tribe-card shadow-none animate-pulse">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-stone-200 dark:bg-tribe-mid rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-stone-200 dark:bg-tribe-mid rounded w-1/3 mb-2" />
                      <div className="h-3 bg-stone-200 dark:bg-tribe-mid rounded w-2/3" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-stone-200 dark:bg-tribe-dark border-b border-stone-300 dark:border-black">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4 gap-3">
          <button onClick={() => router.back()} className="flex-shrink-0">
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </button>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('connections')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto">
        {/* Tabs */}
        <div className="flex border-b border-stone-300 dark:border-tribe-mid px-4 gap-0">
          <button
            onClick={() => setActiveTab('connections')}
            className={`flex-1 py-3 px-4 text-center font-medium border-b-2 transition ${
              activeTab === 'connections'
                ? 'border-tribe-green text-stone-900 dark:text-white'
                : 'border-transparent text-stone-600 dark:text-gray-400'
            }`}
          >
            {t('connections')}
            {connections.length > 0 && (
              <span className="ml-2 text-xs bg-stone-300 dark:bg-tribe-mid px-2 py-1 rounded-full">
                {connections.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-3 px-4 text-center font-medium border-b-2 transition ${
              activeTab === 'requests'
                ? 'border-tribe-green text-stone-900 dark:text-white'
                : 'border-transparent text-stone-600 dark:text-gray-400'
            }`}
          >
            {t('requests')}
            {pendingRequests.length > 0 && (
              <span className="ml-2 text-xs bg-stone-300 dark:bg-tribe-mid px-2 py-1 rounded-full">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        <div className="p-4">
          {error && (
            <Card className="dark:bg-tribe-card border-red-300 dark:border-red-600 shadow-none mb-4">
              <CardContent className="p-4 text-sm text-red-700 dark:text-red-100">{error}</CardContent>
            </Card>
          )}

          {activeTab === 'connections' ? (
            // Connections Tab
            connections.length === 0 ? (
              <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
                <CardContent className="p-8 text-center">
                  <div className="w-16 h-16 bg-stone-100 dark:bg-tribe-mid rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-8 h-8 text-stone-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noConnections')}</h3>
                  <p className="text-stone-500 dark:text-gray-400 mb-4">{t('noConnectionsDesc')}</p>
                  <Link href="/">
                    <Button className="font-bold">{t('findSessions')}</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => (
                  <Card key={conn.id} className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <Link href={`/profile/${conn.id}`} className="flex-shrink-0">
                          <div className="w-12 h-12 bg-stone-300 dark:bg-tribe-mid rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden">
                            {conn.avatar_url ? (
                              <Image
                                src={conn.avatar_url}
                                alt={conn.name}
                                width={48}
                                height={48}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-stone-700 dark:text-gray-300">
                                {conn.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .toUpperCase()
                                  .slice(0, 2)}
                              </span>
                            )}
                          </div>
                        </Link>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <Link href={`/profile/${conn.id}`}>
                            <h3 className="font-semibold text-stone-900 dark:text-white truncate">{conn.name}</h3>
                          </Link>
                          {conn.sports.length > 0 && (
                            <p className="text-xs text-stone-600 dark:text-gray-400 truncate">
                              {conn.sports.slice(0, 2).join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 flex-shrink-0">
                          <Link href={`/messages?user=${conn.id}`}>
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              disabled={actionLoading === conn.id}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRemove(conn.id)}
                            disabled={actionLoading === conn.id}
                            className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-600"
                          >
                            <UserX className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : // Requests Tab
          pendingRequests.length === 0 ? (
            <Card className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 bg-stone-100 dark:bg-tribe-mid rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-stone-400" />
                </div>
                <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">{t('noRequests')}</h3>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {pendingRequests.map((req) => (
                <Card key={req.id} className="dark:bg-tribe-card border-stone-200 dark:border-tribe-mid shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <Link href={`/profile/${req.requester.id}`} className="flex-shrink-0">
                        <div className="w-12 h-12 bg-stone-300 dark:bg-tribe-mid rounded-full flex items-center justify-center text-sm font-semibold overflow-hidden">
                          {req.requester.avatar_url ? (
                            <Image
                              src={req.requester.avatar_url}
                              alt={req.requester.name}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-stone-700 dark:text-gray-300">
                              {req.requester.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </span>
                          )}
                        </div>
                      </Link>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <Link href={`/profile/${req.requester.id}`}>
                          <h3 className="font-semibold text-stone-900 dark:text-white truncate">
                            {req.requester.name}
                          </h3>
                        </Link>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(req.id)}
                          disabled={actionLoading === req.id}
                          className="bg-tribe-green-light text-stone-900 hover:bg-tribe-green-hover"
                        >
                          {actionLoading === req.id ? '...' : t('accept')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(req.id)}
                          disabled={actionLoading === req.id}
                        >
                          {t('decline')}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
