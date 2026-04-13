/** Page: /admin/partners — Manage Featured Partner applications and statuses */
'use client';

import Link from 'next/link';
import { ArrowLeft, Store, Clock, CheckCircle, PauseCircle, XCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useAdminPartners } from './useAdminPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-yellow-500" />,
  active: <CheckCircle className="w-4 h-4 text-tribe-green" />,
  paused: <PauseCircle className="w-4 h-4 text-orange-400" />,
  expired: <XCircle className="w-4 h-4 text-red-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  active: 'bg-tribe-green/20 text-tribe-green border-tribe-green/30',
  paused: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  expired: 'bg-red-500/20 text-red-300 border-red-500/30',
};

export default function AdminPartnersPage() {
  const { language } = useLanguage();
  const {
    loading,
    authorized,
    partners,
    actionLoading,
    statusFilter,
    setStatusFilter,
    counts,
    handleApprove,
    handleTogglePause,
    handleTierChange,
    t,
  } = useAdminPartners(language as 'en' | 'es');

  if (loading) {
    return (
      <div className="min-h-screen bg-tribe-dark">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }
  if (!authorized) return null;

  const filters = ['all', 'pending', 'active', 'paused', 'expired'] as const;

  return (
    <div className="min-h-screen bg-tribe-dark pb-16 safe-area-top">
      <div className="w-full max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin" className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Store className="w-5 h-5 text-tribe-green" />
              {t('Manage Affiliates', 'Gestionar Afiliados')}
            </h1>
            <p className="text-xs text-[#B1B3B6]">
              {t(`${counts.all} total, ${counts.pending} pending`, `${counts.all} total, ${counts.pending} pendientes`)}
            </p>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition ${
                statusFilter === f
                  ? 'bg-tribe-green text-slate-900 border-tribe-green'
                  : 'bg-tribe-surface text-[#B1B3B6] border-[#52575D] hover:bg-tribe-mid'
              }`}
            >
              {f === 'all' ? t('All', 'Todos') : f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>

        {/* Partner list */}
        {partners.length === 0 ? (
          <div className="text-center py-12">
            <Store className="w-12 h-12 text-[#52575D] mx-auto mb-3" />
            <p className="text-[#B1B3B6] text-sm">{t('No affiliates found', 'No se encontraron afiliados')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {partners.map((p) => (
              <PartnerCard
                key={p.id}
                partner={p}
                actionLoading={actionLoading}
                onApprove={handleApprove}
                onTogglePause={handleTogglePause}
                onTierChange={handleTierChange}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerCard({
  partner: p,
  actionLoading,
  onApprove,
  onTogglePause,
  onTierChange,
  t,
}: {
  partner: FeaturedPartner;
  actionLoading: string | null;
  onApprove: (id: string) => void;
  onTogglePause: (p: FeaturedPartner) => void;
  onTierChange: (id: string, tier: string) => void;
  t: (en: string, es: string) => string;
}) {
  const isLoading = actionLoading === p.id;

  return (
    <div className="bg-tribe-surface rounded-2xl p-4 border border-[#52575D]">
      {/* Top row: name + status */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-bold text-sm truncate">{p.business_name}</h3>
          <p className="text-xs text-[#B1B3B6]">{p.business_type}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[p.status] ?? ''}`}
        >
          {STATUS_ICONS[p.status]}
          {p.status.toUpperCase()}
        </span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-xs text-[#B1B3B6] mb-3">
        <div>
          <span className="text-[#808890]">{t('Specialties', 'Especialidades')}:</span>{' '}
          {p.specialties?.length ? p.specialties.slice(0, 3).join(', ') : '—'}
        </div>
        <div>
          <span className="text-[#808890]">{t('Created', 'Creado')}:</span>{' '}
          {new Date(p.created_at).toLocaleDateString()}
        </div>
        {p.expires_at && (
          <div>
            <span className="text-[#808890]">{t('Expires', 'Expira')}:</span>{' '}
            {new Date(p.expires_at).toLocaleDateString()}
          </div>
        )}
        <div>
          <span className="text-[#808890]">{t('Impressions', 'Impresiones')}:</span> {p.total_impressions}
        </div>
      </div>

      {/* Tier selector */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-[#808890]">{t('Tier', 'Nivel')}:</span>
        <select
          value={p.tier}
          onChange={(e) => onTierChange(p.id, e.target.value)}
          disabled={isLoading}
          className="bg-tribe-mid text-white text-xs rounded-lg px-2 py-1 border border-[#52575D] focus:border-tribe-green outline-none"
        >
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
          <option value="elite">Elite</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {p.status === 'pending' && (
          <button
            onClick={() => onApprove(p.id)}
            disabled={isLoading}
            className="flex-1 py-2 bg-tribe-green text-slate-900 font-bold text-xs rounded-xl hover:bg-[#b0d853] transition disabled:opacity-50"
          >
            {isLoading ? '...' : t('Approve', 'Aprobar')}
          </button>
        )}
        {(p.status === 'active' || p.status === 'paused') && (
          <button
            onClick={() => onTogglePause(p)}
            disabled={isLoading}
            className={`flex-1 py-2 font-bold text-xs rounded-xl transition disabled:opacity-50 ${
              p.status === 'active'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30'
                : 'bg-tribe-green/20 text-tribe-green border border-tribe-green/30 hover:bg-tribe-green/30'
            }`}
          >
            {isLoading ? '...' : p.status === 'active' ? t('Pause', 'Pausar') : t('Reactivate', 'Reactivar')}
          </button>
        )}
      </div>
    </div>
  );
}
