'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import CardPhotoPicker from '@/components/profile/CardPhotoPicker';
import type { CardBox } from '@/lib/og/cardCrop';
import { showError, showSuccess } from '@/lib/toast';

/**
 * T-SHARE1 Part C: an admin picks the photo any coach's share card shows, with
 * the coach's own picker, saved through /api/admin/users/[id]/card-photo.
 */
export default function AdminCardPhoto({ userId }: { userId: string }) {
  const t = useTranslations('coachLink');
  const [data, setData] = useState<{ photos: string[]; url: string | null; box: CardBox | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/users/${userId}/card-photo`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [userId]);

  if (failed) return <p className="px-3 pb-3 text-xs text-red-600">{t('loadFailed')}</p>;
  if (!data) return null;

  async function save(url: string, box: CardBox) {
    const r = await fetch(`/api/admin/users/${userId}/card-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, box }),
    });
    if (r.ok) showSuccess(t('photoSaved'));
    else showError(t('photoFailed'));
    return r.ok;
  }

  return (
    <div className="px-3 pb-3">
      <CardPhotoPicker photos={data.photos} initialUrl={data.url} initialBox={data.box} onSave={save} />
    </div>
  );
}
