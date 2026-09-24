'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';
import { showSuccess } from '@/lib/toast';
import { SkeletonCard } from '@/components/Skeleton';
import CommunityEditForm from '@/components/communities/CommunityEditForm';
import { getCommunityPermissions } from '@/lib/communityPermissions';
import {
  fetchCommunityById,
  fetchMyCommunityRole,
  updateCommunity,
  COMMUNITY_WRITE_REFUSED,
  type CommunityEditableFields,
} from '@/lib/dal/communities';

/**
 * /communities/[id]/edit. Creator and admin members only, which is exactly
 * who the communities UPDATE policy admits. Anyone else is sent back to the
 * community page rather than shown a form the database would refuse.
 *
 * The form is not rendered until the row has loaded, so there is no state in
 * which Save can send defaults over real values. Same rule as the sports step
 * and the storefront editor.
 */
export default function EditCommunityPage() {
  const router = useRouter();
  const params = useParams();
  const communityId = params?.id as string;
  const supabase = createClient();
  const t = useTranslations('communityEdit');

  const [initial, setInitial] = useState<CommunityEditableFields | null>(null);

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/auth?returnTo=${encodeURIComponent(`/communities/${communityId}/edit`)}`);
        return;
      }

      const [communityRes, roleRes] = await Promise.all([
        fetchCommunityById(supabase, communityId),
        fetchMyCommunityRole(supabase, communityId, user.id),
      ]);

      if (!communityRes.success || !communityRes.data) {
        if (communityRes.error) logError(new Error(communityRes.error), { action: 'editCommunity.load' });
        router.replace('/communities');
        return;
      }

      const row = communityRes.data;
      const { canManage } = getCommunityPermissions({
        userId: user.id,
        creatorId: row.creator_id,
        myRole: roleRes.success ? (roleRes.data ?? null) : null,
      });
      if (!canManage) {
        router.replace(`/communities/${communityId}`);
        return;
      }

      if (!cancelled) {
        setInitial({
          name: row.name,
          description: row.description,
          sport: row.sport,
          location_name: row.location_name,
          location_lat: row.location_lat,
          location_lng: row.location_lng,
          is_private: row.is_private,
        });
      }
    }

    load().catch((error) => logError(error, { action: 'editCommunity.load' }));
    return () => {
      cancelled = true;
    };
    // supabase and router are stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId]);

  async function handleSave(patch: Partial<CommunityEditableFields>): Promise<string | null> {
    const res = await updateCommunity(supabase, communityId, patch);
    if (!res.success) {
      if (res.error !== COMMUNITY_WRITE_REFUSED) logError(new Error(res.error), { action: 'updateCommunity' });
      return res.error === COMMUNITY_WRITE_REFUSED ? t('refused') : t('failed');
    }
    showSuccess(t('saved'));
    router.push(`/communities/${communityId}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface">
      <div className="sticky top-0 safe-area-top bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push(`/communities/${communityId}`)}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
            aria-label={t('back')}
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-2xl font-bold text-theme-primary">{t('title')}</h1>
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-8 pb-24">
        {initial ? (
          <CommunityEditForm
            initial={initial}
            onSave={handleSave}
            onCancel={() => router.push(`/communities/${communityId}`)}
          />
        ) : (
          <div className="h-64">
            <SkeletonCard />
          </div>
        )}
      </div>
    </div>
  );
}
