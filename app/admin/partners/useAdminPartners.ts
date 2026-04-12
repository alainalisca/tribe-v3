/** Hook: useAdminPartners — state and actions for admin partner management */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';
import { fetchAllPartners, updatePartnerStatus, updatePartnerTier } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import { showSuccess, showError } from '@/lib/toast';

export function useAdminPartners(language: 'en' | 'es') {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [partners, setPartners] = useState<FeaturedPartner[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const t = (en: string, es: string) => (language === 'es' ? es : en);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      if (!adminResult.success || !adminResult.data) {
        showError(t('Unauthorized', 'No autorizado'));
        router.push('/');
        return;
      }
      setAuthorized(true);
      await loadPartners();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPartners = useCallback(async () => {
    const result = await fetchAllPartners(supabase);
    if (result.success && result.data) setPartners(result.data);
  }, [supabase]);

  async function handleApprove(partnerId: string) {
    setActionLoading(partnerId);
    const result = await updatePartnerStatus(supabase, partnerId, 'active');
    if (result.success) {
      showSuccess(t('Partner approved', 'Socio aprobado'));
      await loadPartners();
    } else {
      showError(result.error ?? t('Failed to approve', 'Error al aprobar'));
    }
    setActionLoading(null);
  }

  async function handleTogglePause(partner: FeaturedPartner) {
    const newStatus = partner.status === 'active' ? 'paused' : 'active';
    setActionLoading(partner.id);
    const result = await updatePartnerStatus(supabase, partner.id, newStatus);
    if (result.success) {
      showSuccess(
        newStatus === 'paused' ? t('Partner paused', 'Socio pausado') : t('Partner reactivated', 'Socio reactivado')
      );
      await loadPartners();
    } else {
      showError(result.error ?? t('Failed to update', 'Error al actualizar'));
    }
    setActionLoading(null);
  }

  async function handleTierChange(partnerId: string, tier: string) {
    setActionLoading(partnerId);
    const result = await updatePartnerTier(supabase, partnerId, tier);
    if (result.success) {
      showSuccess(t('Tier updated', 'Nivel actualizado'));
      await loadPartners();
    } else {
      showError(result.error ?? t('Failed to update tier', 'Error al actualizar nivel'));
    }
    setActionLoading(null);
  }

  const filteredPartners = statusFilter === 'all' ? partners : partners.filter((p) => p.status === statusFilter);

  const counts = {
    all: partners.length,
    pending: partners.filter((p) => p.status === 'pending').length,
    active: partners.filter((p) => p.status === 'active').length,
    paused: partners.filter((p) => p.status === 'paused').length,
    expired: partners.filter((p) => p.status === 'expired').length,
  };

  return {
    loading,
    authorized,
    partners: filteredPartners,
    actionLoading,
    statusFilter,
    setStatusFilter,
    counts,
    handleApprove,
    handleTogglePause,
    handleTierChange,
    t,
  };
}
