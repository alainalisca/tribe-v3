'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchUserIsAdmin } from '@/lib/dal';
import {
  fetchPendingBulletinPosts,
  fetchApprovedBulletinPosts,
  updateBulletinStatus,
  deleteBulletinPost,
  type BulletinPost,
} from '@/lib/dal/communityBulletin';
import { showSuccess, showError } from '@/lib/toast';
import { logError } from '@/lib/logger';
import { Check, X, Trash2, ArrowLeft } from 'lucide-react';

export default function AdminBulletinPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<BulletinPost[]>([]);
  const [approved, setApproved] = useState<BulletinPost[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const t = {
    title: language === 'es' ? 'Gestionar Tablon' : 'Manage Bulletin',
    back: language === 'es' ? 'Volver' : 'Back',
    pending: language === 'es' ? 'Pendientes' : 'Pending',
    approved: language === 'es' ? 'Aprobados' : 'Approved',
    approve: language === 'es' ? 'Aprobar' : 'Approve',
    reject: language === 'es' ? 'Rechazar' : 'Reject',
    delete: language === 'es' ? 'Eliminar' : 'Delete',
    noPending: language === 'es' ? 'No hay posts pendientes' : 'No pending posts',
    noApproved: language === 'es' ? 'No hay posts aprobados' : 'No approved posts',
    by: language === 'es' ? 'por' : 'by',
  };

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
        showError(language === 'es' ? 'Acceso no autorizado' : 'Unauthorized access');
        router.push('/');
        return;
      }
      setAuthorized(true);
      await loadData();
      setLoading(false);
    })();
  }, []);

  async function loadData() {
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetchPendingBulletinPosts(supabase),
        fetchApprovedBulletinPosts(supabase, { limit: 50 }),
      ]);
      if (pendingRes.success) setPending(pendingRes.data || []);
      if (approvedRes.success) setApproved(approvedRes.data || []);
    } catch (error) {
      logError(error, { action: 'loadBulletinAdmin' });
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    const result = await updateBulletinStatus(supabase, id, 'approved');
    if (result.success) {
      showSuccess(language === 'es' ? 'Post aprobado' : 'Post approved');
      await loadData();
    } else {
      showError(result.error || 'Failed');
    }
    setActionLoading(null);
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    const result = await updateBulletinStatus(supabase, id, 'rejected');
    if (result.success) {
      showSuccess(language === 'es' ? 'Post rechazado' : 'Post rejected');
      await loadData();
    } else {
      showError(result.error || 'Failed');
    }
    setActionLoading(null);
  }

  async function handleDelete(id: string) {
    if (!confirm(language === 'es' ? 'Eliminar este post?' : 'Delete this post?')) return;
    setActionLoading(id);
    const result = await deleteBulletinPost(supabase, id);
    if (result.success) {
      showSuccess(language === 'es' ? 'Post eliminado' : 'Post deleted');
      await loadData();
    } else {
      showError(result.error || 'Failed');
    }
    setActionLoading(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <div className="text-lg">{language === 'es' ? 'Cargando...' : 'Loading...'}</div>
      </div>
    );
  }
  if (!authorized) return null;

  function PostRow({ post, showActions }: { post: BulletinPost; showActions: boolean }) {
    const isLoading = actionLoading === post.id;
    return (
      <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-[#272D34] truncate">{post.title}</h3>
            <p className="text-xs text-stone-500">
              {t.by} {post.author?.name || 'Unknown'} &middot; {post.category}
              {post.event_date && ` &middot; ${post.event_date}`}
            </p>
            {post.description_en && <p className="text-xs text-stone-600 mt-1 line-clamp-2">{post.description_en}</p>}
          </div>
          {post.image_url && <img src={post.image_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />}
        </div>
        <div className="flex gap-2">
          {showActions && (
            <>
              <button
                onClick={() => handleApprove(post.id)}
                disabled={isLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition disabled:opacity-50"
              >
                <Check className="w-3 h-3" /> {t.approve}
              </button>
              <button
                onClick={() => handleReject(post.id)}
                disabled={isLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition disabled:opacity-50"
              >
                <X className="w-3 h-3" /> {t.reject}
              </button>
            </>
          )}
          <button
            onClick={() => handleDelete(post.id)}
            disabled={isLoading}
            className="flex items-center gap-1 px-3 py-1.5 bg-stone-200 text-stone-700 text-xs font-medium rounded-lg hover:bg-stone-300 transition disabled:opacity-50 ml-auto"
          >
            <Trash2 className="w-3 h-3" /> {t.delete}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-20 safe-area-top">
      <div className="w-full max-w-md mx-auto px-3 py-4">
        <Link href="/admin" className="inline-flex items-center gap-1 text-stone-600 mb-3 text-sm">
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </Link>
        <h1 className="text-lg font-bold text-[#272D34] mb-4">{t.title}</h1>

        {/* Pending */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-stone-500 mb-2">
            {t.pending} ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-xs text-stone-400 py-4 text-center">{t.noPending}</p>
          ) : (
            <div className="space-y-3">
              {pending.map((post) => (
                <PostRow key={post.id} post={post} showActions />
              ))}
            </div>
          )}
        </section>

        {/* Approved */}
        <section>
          <h2 className="text-sm font-semibold text-stone-500 mb-2">
            {t.approved} ({approved.length})
          </h2>
          {approved.length === 0 ? (
            <p className="text-xs text-stone-400 py-4 text-center">{t.noApproved}</p>
          ) : (
            <div className="space-y-3">
              {approved.map((post) => (
                <PostRow key={post.id} post={post} showActions={false} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
