'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BottomNav from '@/components/BottomNav';
import { DollarSign, TrendingUp, Clock, ArrowUpRight, AlertCircle, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { logError } from '@/lib/logger';

interface PaymentTransaction {
  id: string;
  amount_cents: number;
  platform_fee_cents: number;
  instructor_payout_cents: number;
  currency: 'COP' | 'USD';
  status: 'pending' | 'processing' | 'approved' | 'declined' | 'voided' | 'error';
  payout_status?: 'completed' | 'pending' | 'processing' | null;
  created_at: string;
  session?: {
    id: string;
    sport?: string;
    date?: string;
    start_time?: string;
    creator_id?: string;
  };
  user?: {
    name?: string;
  };
}

interface SummaryStats {
  totalEarned: number;
  pendingPayouts: number;
  platformFees: number;
  currency: 'COP' | 'USD';
}

const formatPrice = (cents: number, currency: 'COP' | 'USD'): string => {
  const amount = cents / 100;
  if (currency === 'COP') {
    return amount.toLocaleString('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }
  return `$${amount.toFixed(2)}`;
};

const getPaymentStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'pending':
    case 'processing':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'declined':
    case 'voided':
    case 'error':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const getPayoutStatusColor = (status?: string | null) => {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'processing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
};

const formatStatusLabel = (status: string, language: 'en' | 'es'): string => {
  const labels: Record<string, Record<string, string>> = {
    en: {
      pending: 'Pending',
      processing: 'Processing',
      approved: 'Approved',
      declined: 'Declined',
      completed: 'Completed',
      voided: 'Voided',
      error: 'Error',
    },
    es: {
      pending: 'Pendiente',
      processing: 'Procesando',
      approved: 'Aprobado',
      declined: 'Rechazado',
      completed: 'Completado',
      voided: 'Anulado',
      error: 'Error',
    },
  };
  return labels[language]?.[status] || status;
};

const formatDate = (dateString: string, language: 'en' | 'es'): string => {
  const date = new Date(dateString);
  if (language === 'es') {
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function EarningsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats>({
    totalEarned: 0,
    pendingPayouts: 0,
    platformFees: 0,
    currency: 'USD',
  });
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [thisMonthEarnings, setThisMonthEarnings] = useState(0);
  const [lastMonthEarnings, setLastMonthEarnings] = useState(0);

  const itemsPerPage = 10;
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    loadEarningsData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadEarningsData() {
    try {
      setLoading(true);
      setError(null);

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth');
        return;
      }

      // Fetch user profile to check if instructor
      const { data: userProfile, error: userError } = await supabase
        .from('users')
        .select('id, name, is_instructor')
        .eq('id', authUser.id)
        .single();

      if (userError || !userProfile) {
        setError(language === 'es' ? 'Error al cargar perfil' : 'Failed to load profile');
        return;
      }

      if (!userProfile.is_instructor) {
        setUser(userProfile);
        setLoading(false);
        return;
      }

      setUser(userProfile);

      // First, get all sessions created by this instructor
      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id')
        .eq('creator_id', authUser.id);

      if (sessionsError) {
        logError(sessionsError, { action: 'fetchSessions', userId: authUser.id });
        setError(language === 'es' ? 'Error al cargar sesiones' : 'Failed to load sessions');
        return;
      }

      const sessionIds = sessions?.map((s) => s.id) || [];

      if (sessionIds.length === 0) {
        // No sessions, so no payments
        setStats({
          totalEarned: 0,
          pendingPayouts: 0,
          platformFees: 0,
          currency: 'USD',
        });
        setTransactions([]);
        setLoading(false);
        return;
      }

      // Fetch all payments for these sessions with session and user details
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select(
          `
          id,
          amount_cents,
          platform_fee_cents,
          instructor_payout_cents,
          currency,
          status,
          payout_status,
          created_at,
          session:sessions(id, sport, date, start_time, creator_id),
          user:users(name)
        `
        )
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false });

      if (paymentsError) {
        logError(paymentsError, { action: 'fetchPayments', sessionIds });
        setError(language === 'es' ? 'Error al cargar pagos' : 'Failed to load payments');
        return;
      }

      const allPayments: PaymentTransaction[] = (payments || []).map((p) => ({
        ...p,
        session: Array.isArray(p.session) ? p.session[0] : p.session,
        user: Array.isArray(p.user) ? p.user[0] : p.user,
      }));

      // Calculate stats
      let totalEarned = 0;
      let pendingPayouts = 0;
      let platformFees = 0;
      let primaryCurrency: 'COP' | 'USD' = 'USD';
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      let thisMonthTotal = 0;
      let lastMonthTotal = 0;

      allPayments.forEach((payment) => {
        if (payment.status === 'approved') {
          totalEarned += payment.instructor_payout_cents;
          primaryCurrency = payment.currency;

          const paymentDate = new Date(payment.created_at);
          if (paymentDate >= thisMonth) {
            thisMonthTotal += payment.instructor_payout_cents;
          } else if (paymentDate >= lastMonth && paymentDate < thisMonth) {
            lastMonthTotal += payment.instructor_payout_cents;
          }
        }

        if (payment.status === 'approved' && payment.payout_status === 'pending') {
          pendingPayouts += payment.instructor_payout_cents;
        }

        platformFees += payment.platform_fee_cents;
      });

      setStats({
        totalEarned,
        pendingPayouts,
        platformFees,
        currency: primaryCurrency,
      });

      setThisMonthEarnings(thisMonthTotal);
      setLastMonthEarnings(lastMonthTotal);
      setTransactions(allPayments);
    } catch (err) {
      logError(err, { action: 'loadEarningsData' });
      setError(language === 'es' ? 'Error al cargar datos' : 'Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{language === 'es' ? 'Cargando...' : 'Loading...'}</p>
      </div>
    );
  }

  if (user && !user.is_instructor) {
    return (
      <div className="min-h-screen bg-theme-page pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
          <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
            <Link href="/profile">
              <Button variant="ghost" size="icon" className="mr-3">
                <ChevronLeft className="w-6 h-6 text-theme-primary" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">
              {language === 'es' ? 'Ganancias' : 'Earnings'}
            </h1>
          </div>
        </div>

        <div className="pt-header max-w-2xl mx-auto p-4">
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-300 mb-2">
                    {language === 'es' ? 'Esta página es para instructores' : 'This page is for instructors'}
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200 mb-4">
                    {language === 'es'
                      ? 'Completa tu perfil de instructor en la página de edición para comenzar a crear sesiones pagadas.'
                      : 'Complete your instructor profile on the edit page to start creating paid sessions.'}
                  </p>
                  <Link href="/profile/edit">
                    <Button className="bg-tribe-green text-slate-900 hover:bg-[#8FD642]">
                      {language === 'es' ? 'Ir a Editar Perfil' : 'Go to Edit Profile'}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-theme-page flex flex-col items-center justify-center p-4 pb-32">
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20 w-full max-w-2xl">
          <CardContent className="pt-6">
            <p className="text-theme-primary font-semibold mb-4">{error}</p>
            <Button onClick={loadEarningsData} className="bg-tribe-green text-slate-900 hover:bg-[#8FD642]">
              {language === 'es' ? 'Intentar de nuevo' : 'Try Again'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/profile">
            <Button variant="ghost" size="icon" className="mr-3">
              <ChevronLeft className="w-6 h-6 text-theme-primary" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">
            {language === 'es' ? 'Ganancias' : 'Earnings'}
          </h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {/* Revenue Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total Earned */}
          <Card className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-green-50 dark:from-tribe-green/5 dark:to-green-900/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-theme-secondary">
                  {language === 'es' ? 'Total Ganado' : 'Total Earned'}
                </CardTitle>
                <div className="bg-tribe-green/20 p-2 rounded-lg">
                  <DollarSign className="w-5 h-5 text-tribe-green" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-theme-primary">
                {formatPrice(stats.totalEarned, stats.currency)}
              </p>
              <p className="text-xs text-theme-secondary mt-2">
                {transactions.length} {language === 'es' ? 'pagos aprobados' : 'approved payments'}
              </p>
            </CardContent>
          </Card>

          {/* Pending Payouts */}
          <Card className="border-amber-200/50 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-theme-secondary">
                  {language === 'es' ? 'Pagos Pendientes' : 'Pending Payouts'}
                </CardTitle>
                <div className="bg-amber-200/30 p-2 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-theme-primary">
                {formatPrice(stats.pendingPayouts, stats.currency)}
              </p>
              <p className="text-xs text-theme-secondary mt-2">
                {language === 'es' ? 'Procesándose' : 'In progress'}
              </p>
            </CardContent>
          </Card>

          {/* Platform Fees */}
          <Card className="border-gray-200 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-theme-secondary">
                  {language === 'es' ? 'Comisiones (10%)' : 'Platform Fees (10%)'}
                </CardTitle>
                <div className="bg-gray-200/30 p-2 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-gray-600" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-theme-primary">
                {formatPrice(stats.platformFees, stats.currency)}
              </p>
              <p className="text-xs text-theme-secondary mt-2">
                {language === 'es' ? 'De todas las transacciones' : 'From all transactions'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Comparison Chart */}
        <Card>
          <CardHeader>
            <CardTitle>{language === 'es' ? 'Este Mes vs Mes Anterior' : 'This Month vs Last Month'}</CardTitle>
            <CardDescription>
              {language === 'es' ? 'Comparación de ganancias mensuales' : 'Monthly earnings comparison'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 h-48">
              {/* This Month */}
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full bg-theme-secondary/10 rounded-lg relative flex-1 flex items-end justify-center mb-3 min-h-32">
                  <div
                    className="w-4/5 bg-tribe-green rounded-t-lg flex items-center justify-center transition-all"
                    style={{
                      height: Math.max(
                        20,
                        (thisMonthEarnings / Math.max(thisMonthEarnings, lastMonthEarnings, 1)) * 100
                      ) + '%',
                    }}
                  >
                    <span className="text-white font-bold text-sm">
                      {formatPrice(thisMonthEarnings, stats.currency)}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium text-theme-primary">
                  {language === 'es' ? 'Este mes' : 'This month'}
                </p>
              </div>

              {/* Last Month */}
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full bg-theme-secondary/10 rounded-lg relative flex-1 flex items-end justify-center mb-3 min-h-32">
                  <div
                    className="w-4/5 bg-gray-400 rounded-t-lg flex items-center justify-center transition-all"
                    style={{
                      height: Math.max(
                        20,
                        (lastMonthEarnings / Math.max(thisMonthEarnings, lastMonthEarnings, 1)) * 100
                      ) + '%',
                    }}
                  >
                    <span className="text-white font-bold text-sm">
                      {formatPrice(lastMonthEarnings, stats.currency)}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium text-theme-primary">
                  {language === 'es' ? 'Mes anterior' : 'Last month'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>{language === 'es' ? 'Historial de Transacciones' : 'Transaction History'}</CardTitle>
            <CardDescription>
              {transactions.length === 0
                ? language === 'es'
                  ? 'No hay transacciones aún'
                  : 'No transactions yet'
                : language === 'es'
                ? `${transactions.length} transacción${transactions.length !== 1 ? 'es' : ''}`
                : `${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-theme-secondary mb-4">
                  {language === 'es'
                    ? 'Crea sesiones de pago para ver las transacciones aquí'
                    : 'Create paid sessions to see transactions here'}
                </p>
                <Link href="/create">
                  <Button className="bg-tribe-green text-slate-900 hover:bg-[#8FD642]">
                    {language === 'es' ? 'Crear Sesión' : 'Create Session'}
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-theme">
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Fecha' : 'Date'}
                        </th>
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Sesión' : 'Session'}
                        </th>
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Monto' : 'Amount'}
                        </th>
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Tarifa' : 'Fee'}
                        </th>
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Pago' : 'Payout'}
                        </th>
                        <th className="text-left py-3 px-2 font-semibold text-theme-primary">
                          {language === 'es' ? 'Estado' : 'Status'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.map((transaction) => (
                        <tr key={transaction.id} className="border-b border-theme/50 hover:bg-theme/30">
                          <td className="py-3 px-2 text-theme-primary whitespace-nowrap">
                            {formatDate(transaction.created_at, language)}
                          </td>
                          <td className="py-3 px-2 text-theme-secondary">
                            {transaction.session?.sport || language === 'es' ? 'Desconocido' : 'Unknown'}
                          </td>
                          <td className="py-3 px-2 text-theme-primary font-semibold">
                            {formatPrice(transaction.amount_cents, transaction.currency)}
                          </td>
                          <td className="py-3 px-2 text-theme-secondary text-xs">
                            {formatPrice(transaction.platform_fee_cents, transaction.currency)}
                          </td>
                          <td className="py-3 px-2 text-theme-primary font-semibold">
                            {formatPrice(transaction.instructor_payout_cents, transaction.currency)}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex flex-col gap-1">
                              <Badge className={`text-xs whitespace-nowrap ${getPaymentStatusColor(transaction.status)}`}>
                                {formatStatusLabel(transaction.status, language)}
                              </Badge>
                              {transaction.payout_status && (
                                <Badge
                                  className={`text-xs whitespace-nowrap ${getPayoutStatusColor(transaction.payout_status)}`}
                                >
                                  {formatStatusLabel(transaction.payout_status, language)}
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-theme">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      {language === 'es' ? 'Anterior' : 'Previous'}
                    </Button>

                    <div className="flex gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className={currentPage === page ? 'bg-tribe-green text-slate-900' : ''}
                        >
                          {page}
                        </Button>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {language === 'es' ? 'Siguiente' : 'Next'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}
