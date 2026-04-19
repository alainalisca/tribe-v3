'use client';

import { Star, Users, Calendar, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { formatPrice } from '@/lib/formatCurrency';
import type { InstructorStats } from '@/lib/dal/instructorDashboard';
import type { Currency } from '@/lib/payments/config';

interface InstructorAnalyticsProps {
  language: 'en' | 'es';
  stats: InstructorStats;
}

export default function InstructorAnalytics({ language, stats }: InstructorAnalyticsProps) {
  const txt = {
    totalSessions: language === 'es' ? 'Sesiones' : 'Sessions',
    athletes: language === 'es' ? 'Atletas' : 'Athletes',
    avgRating: language === 'es' ? 'Calificacion' : 'Avg Rating',
    revenue: language === 'es' ? 'Ingresos' : 'Revenue',
    monthlyTrend: language === 'es' ? 'Tendencia Mensual' : 'Monthly Trend',
    thisMonth: language === 'es' ? 'Este mes' : 'This month',
    lastMonth: language === 'es' ? 'Mes pasado' : 'Last month',
    sessions: language === 'es' ? 'sesiones' : 'sessions',
    viewDetailed: language === 'es' ? 'Ver detalles en Ganancias' : 'View details in Earnings',
  };

  const trendUp = stats.sessionsThisMonth >= stats.sessionsLastMonth;
  const trendDiff = stats.sessionsThisMonth - stats.sessionsLastMonth;

  const cards = [
    {
      label: txt.totalSessions,
      value: stats.totalSessions.toString(),
      icon: Calendar,
      color: 'text-blue-500',
    },
    {
      label: txt.athletes,
      value: stats.totalAthletes.toString(),
      icon: Users,
      color: 'text-purple-500',
    },
    {
      label: txt.avgRating,
      value: stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '--',
      icon: Star,
      color: 'text-yellow-500',
    },
    {
      label: txt.revenue,
      value:
        stats.totalRevenueCents > 0 ? formatPrice(stats.totalRevenueCents, stats.revenueCurrency as Currency) : '--',
      icon: DollarSign,
      color: 'text-tribe-green',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="p-4 bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-theme-secondary">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-theme-primary">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly Trend */}
      <div className="p-4 bg-white dark:bg-tribe-surface rounded-xl border border-stone-200 dark:border-tribe-mid">
        <h4 className="text-sm font-semibold text-theme-primary mb-3">{txt.monthlyTrend}</h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-theme-secondary">{txt.thisMonth}</p>
            <p className="text-xl font-bold text-theme-primary">
              {stats.sessionsThisMonth} <span className="text-xs font-normal text-theme-secondary">{txt.sessions}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-theme-secondary">{txt.lastMonth}</p>
            <p className="text-xl font-bold text-theme-primary">
              {stats.sessionsLastMonth} <span className="text-xs font-normal text-theme-secondary">{txt.sessions}</span>
            </p>
          </div>
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium ${trendUp ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}
          >
            {trendUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {trendDiff >= 0 ? '+' : ''}
            {trendDiff}
          </div>
        </div>
      </div>

      {/* Link to detailed earnings */}
      <a href="/earnings" className="block text-center text-sm text-tribe-green font-medium hover:underline">
        {txt.viewDetailed} &rarr;
      </a>
    </div>
  );
}
