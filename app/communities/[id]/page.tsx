'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { trackEvent } from '@/lib/analytics';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import BottomNav from '@/components/BottomNav';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { SkeletonCard } from '@/components/Skeleton';
import {
  fetchCommunityById,
  fetchCommunityPosts,
  fetchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  isCommunityMember,
  deleteCommunityPost,
  setCommunityPostPinned,
  reportCommunityPost,
  updateCommunityCoverImage,
  type CommunityWithCreator,
  type CommunityPostWithPin,
  type CommunityMemberWithUser,
} from '@/lib/dal/communities';
import { compressImage } from '@/components/session/recapPhotosHelpers';
import { sportTranslations } from '@/lib/translations';
import Image from 'next/image';
import {
  ChevronLeft,
  Users,
  MessageCircle,
  Heart,
  Trash2,
  Loader2,
  Plus,
  Camera,
  Pin,
  PinOff,
  Flag,
  MoreHorizontal,
} from 'lucide-react';

const getTranslations = (language: 'en' | 'es') => ({
  members: language === 'es' ? 'Miembros' : 'Members',
  posts: language === 'es' ? 'Publicaciones' : 'Posts',
  join: language === 'es' ? 'Unirse' : 'Join',
  leave: language === 'es' ? 'Salir' : 'Leave',
  newPost: language === 'es' ? 'Nueva Publicación' : 'New Post',
  admin: language === 'es' ? 'Admin' : 'Admin',
  moderator: language === 'es' ? 'Mod' : 'Mod',
  noPosts: language === 'es' ? 'Sin publicaciones' : 'No posts yet',
  loading: language === 'es' ? 'Cargando...' : 'Loading...',
  comment: language === 'es' ? 'Comentar' : 'Comment',
  delete: language === 'es' ? 'Eliminar' : 'Delete',
  deleteConfirm: language === 'es' ? '¿Eliminar publicación?' : 'Delete post?',
  noPosts2: language === 'es' ? 'Sin publicaciones aún' : 'No posts yet',
  joinToContinue: language === 'es' ? 'Únete a la comunidad para ver publicaciones' : 'Join the community to see posts',
  noMembers: language === 'es' ? 'Sin miembros' : 'No members',
  changeBanner: language === 'es' ? 'Cambiar Banner' : 'Change Banner',
  uploadingBanner: language === 'es' ? 'Subiendo banner...' : 'Uploading banner...',
  bannerSuccess: language === 'es' ? 'Banner actualizado' : 'Banner updated',
  bannerError: language === 'es' ? 'No se pudo subir el banner' : 'Failed to upload banner',
  pin: language === 'es' ? 'Fijar' : 'Pin',
  unpin: language === 'es' ? 'Desfijar' : 'Unpin',
  pinned: language === 'es' ? 'Fijado' : 'Pinned',
  report: language === 'es' ? 'Reportar' : 'Report',
  reportConfirm: language === 'es' ? '¿Reportar esta publicación?' : 'Report this post?',
  reported: language === 'es' ? 'Publicación reportada' : 'Post reported',
  reportError: language === 'es' ? 'No se pudo reportar' : 'Failed to report',
  deleted: language === 'es' ? 'Publicación eliminada' : 'Post deleted',
  deleteError: language === 'es' ? 'No se pudo eliminar' : 'Failed to delete',
  pinnedToast: language === 'es' ? 'Publicación fijada' : 'Post pinned',
  unpinnedToast: language === 'es' ? 'Publicación desfijada' : 'Post unpinned',
});

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const communityId = params?.id as string;

  const [community, setCommunity] = useState<CommunityWithCreator | null>(null);
  const [posts, setPosts] = useState<CommunityPostWithPin[]>([]);
  const [members, setMembers] = useState<CommunityMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'members'>('posts');
  const [joining, setJoining] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    }
    getUser();
  }, []);

  useEffect(() => {
    if (!communityId) return;
    fetchCommunityData();
  }, [communityId]);

  useEffect(() => {
    if (!userId || !communityId) return;
    checkMembership();
  }, [userId, communityId]);

  async function fetchCommunityData() {
    try {
      setLoading(true);

      const result = await fetchCommunityById(supabase, communityId);
      if (!result.success) {
        logError(new Error(result.error), { action: 'fetchCommunityById' });
        router.push('/communities');
        return;
      }

      setCommunity(result.data ?? null);

      const postsResult = await fetchCommunityPosts(supabase, communityId);
      if (postsResult.success) {
        setPosts((postsResult.data || []) as CommunityPostWithPin[]);
      }

      const membersResult = await fetchCommunityMembers(supabase, communityId);
      if (membersResult.success) {
        setMembers(membersResult.data || []);
      }
    } catch (error) {
      logError(error, { action: 'fetchCommunityData' });
    } finally {
      setLoading(false);
    }
  }

  async function checkMembership() {
    try {
      const result = await isCommunityMember(supabase, communityId, userId!);
      if (result.success) {
        setIsMember(result.data ?? false);
      }
    } catch (error) {
      logError(error, { action: 'checkMembership' });
    }
  }

  async function handleJoinLeave() {
    if (!userId || !communityId) return;

    setJoining(true);
    try {
      if (isMember) {
        const result = await leaveCommunity(supabase, communityId, userId);
        if (result.success) {
          setIsMember(false);
          await fetchCommunityData();
        }
      } else {
        const result = await joinCommunity(supabase, communityId, userId);
        if (result.success) {
          trackEvent('community_joined', { community_id: communityId });
          setIsMember(true);
          await fetchCommunityData();
        }
      }
    } catch (error) {
      logError(error, { action: 'handleJoinLeave' });
    } finally {
      setJoining(false);
    }
  }

  // Owner = community creator. Admin = creator OR member with role admin/moderator.
  const isOwner = !!userId && !!community && community.creator_id === userId;
  const myMembership = members.find((m) => m.user_id === userId);
  const isAdmin = isOwner || myMembership?.role === 'admin' || myMembership?.role === 'moderator';

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId || !communityId) return;
    if (!isOwner && !isAdmin) return;

    setUploadingBanner(true);
    try {
      const compressed = await compressImage(file);
      const fileName = `${communityId}/banner-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage.from('community-banners').upload(fileName, compressed, {
        contentType: 'image/jpeg',
        upsert: true,
      });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('community-banners').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      const updateResult = await updateCommunityCoverImage(supabase, communityId, publicUrl);
      if (!updateResult.success) throw new Error(updateResult.error);

      setCommunity((prev) => (prev ? { ...prev, cover_image_url: publicUrl } : prev));
      await haptic('success');
      showSuccess(t.bannerSuccess);
    } catch (error) {
      logError(error, { action: 'handleBannerUpload' });
      await haptic('error');
      showError(t.bannerError);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  }

  async function handleDeletePost(postId: string) {
    if (!confirm(t.deleteConfirm)) return;
    try {
      const result = await deleteCommunityPost(supabase, postId);
      if (result.success) {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        await haptic('success');
        showSuccess(t.deleted);
      } else {
        await haptic('error');
        showError(result.error || t.deleteError);
      }
    } catch (error) {
      logError(error, { action: 'handleDeletePost' });
      await haptic('error');
      showError(t.deleteError);
    } finally {
      setOpenMenuPostId(null);
    }
  }

  async function handleTogglePin(post: CommunityPostWithPin) {
    const next = !post.is_pinned;
    try {
      const result = await setCommunityPostPinned(supabase, post.id, next);
      if (result.success) {
        await haptic('success');
        showSuccess(next ? t.pinnedToast : t.unpinnedToast);
        await fetchCommunityData();
      } else {
        await haptic('error');
        showError(result.error || t.deleteError);
      }
    } catch (error) {
      logError(error, { action: 'handleTogglePin' });
    } finally {
      setOpenMenuPostId(null);
    }
  }

  async function handleReportPost(postId: string) {
    if (!userId) return;
    if (!confirm(t.reportConfirm)) return;
    try {
      const result = await reportCommunityPost(supabase, { post_id: postId, reporter_id: userId });
      if (result.success) {
        await haptic('success');
        showSuccess(t.reported);
      } else {
        await haptic('error');
        showError(result.error || t.reportError);
      }
    } catch (error) {
      logError(error, { action: 'handleReportPost' });
      await haptic('error');
      showError(t.reportError);
    } finally {
      setOpenMenuPostId(null);
    }
  }

  if (loading || !community) {
    return (
      <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-8">
          <div className="h-64">
            <SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  const sportName = community.sport ? sportTranslations[community.sport]?.[language] || community.sport : null;

  const coverStyle = community.cover_image_url
    ? { backgroundImage: `url(${community.cover_image_url})` }
    : { background: 'linear-gradient(135deg, #A3E635, #9EE551)' };

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-lg font-bold text-theme-primary flex-1 truncate">{community.name}</h1>
        </div>
      </div>

      <div className="max-w-2xl md:max-w-4xl mx-auto">
        {/* Cover image with optional change-banner button */}
        <div className="relative w-full h-48 bg-cover bg-center" style={coverStyle}>
          {(isOwner || isAdmin) && (
            <>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleBannerUpload}
                className="hidden"
                aria-label={t.changeBanner}
              />
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploadingBanner}
                className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-black/80 transition-colors text-sm disabled:opacity-60"
              >
                {uploadingBanner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploadingBanner ? t.uploadingBanner : t.changeBanner}
              </button>
            </>
          )}
        </div>

        {/* Community info */}
        <div className="px-4 py-6 space-y-4 border-b border-gray-200 dark:border-tribe-mid">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-theme-primary">{community.name}</h2>
            {sportName && <p className="text-sm text-tribe-green font-semibold">{sportName}</p>}
          </div>

          {community.description && <p className="text-theme-primary">{community.description}</p>}

          {community.location_name && (
            <p className="text-sm text-stone-600 dark:text-gray-400">{community.location_name}</p>
          )}

          {/* Stats */}
          <div className="flex gap-4 pt-2">
            <div className="flex items-center gap-1">
              <Users className="w-5 h-5 text-tribe-green" />
              <span className="text-sm font-medium text-theme-primary">
                {community.member_count} {t.members}
              </span>
            </div>
          </div>

          {/* Join/Leave button */}
          <button
            onClick={handleJoinLeave}
            disabled={joining}
            className={`w-full py-3 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              isMember
                ? 'border-2 border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10'
                : 'bg-tribe-green hover:bg-tribe-green text-slate-900'
            }`}
          >
            {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {isMember ? t.leave : t.join}
          </button>
        </div>

        {/* Tabs */}
        {isMember && (
          <>
            <div className="flex border-b border-gray-200 dark:border-tribe-mid px-4 sticky top-16 bg-white dark:bg-tribe-surface z-30">
              <button
                onClick={() => setActiveTab('posts')}
                className={`px-4 py-3 font-medium border-b-2 transition ${
                  activeTab === 'posts'
                    ? 'border-tribe-green text-tribe-green'
                    : 'border-transparent text-stone-500 dark:text-gray-400'
                }`}
              >
                {t.posts}
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`px-4 py-3 font-medium border-b-2 transition ${
                  activeTab === 'members'
                    ? 'border-tribe-green text-tribe-green'
                    : 'border-transparent text-stone-500 dark:text-gray-400'
                }`}
              >
                {t.members}
              </button>
            </div>

            {/* Posts Tab */}
            {activeTab === 'posts' && (
              <div className="px-4 py-6 space-y-4">
                {/* New Post — prominent for members */}
                <Link
                  href={`/communities/${communityId}/post`}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-tribe-green text-slate-900 rounded-lg hover:bg-tribe-green font-semibold transition shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                  {t.newPost}
                </Link>

                {posts.length > 0 ? (
                  <div className="space-y-4">
                    {posts.map((post) => {
                      const canDelete = userId === post.author_id || isAdmin;
                      const canPin = isAdmin;
                      const canReport = !!userId && userId !== post.author_id;
                      const menuOpen = openMenuPostId === post.id;

                      return (
                        <div
                          key={post.id}
                          className={`bg-white dark:bg-tribe-mid rounded-lg p-4 space-y-3 ${
                            post.is_pinned ? 'border-2 border-tribe-green' : ''
                          }`}
                        >
                          {/* Post author */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={post.author?.avatar_url || ''} alt={post.author?.name || 'User'} />
                                <AvatarFallback>{post.author?.name?.[0] || 'U'}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-semibold text-theme-primary text-sm">
                                  {post.author?.name || 'Unknown'}
                                </p>
                                <p className="text-xs text-stone-500 dark:text-gray-400">
                                  {new Date(post.created_at).toLocaleDateString(language)}
                                </p>
                              </div>
                              {post.is_pinned && (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-tribe-green bg-tribe-green/10 px-2 py-0.5 rounded-full">
                                  <Pin className="w-3 h-3" />
                                  {t.pinned}
                                </span>
                              )}
                            </div>

                            {/* Action menu */}
                            {(canDelete || canPin || canReport) && (
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMenuPostId(menuOpen ? null : post.id)}
                                  className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-card rounded transition"
                                  aria-label="Post actions"
                                >
                                  <MoreHorizontal className="w-4 h-4 text-stone-500 dark:text-gray-400" />
                                </button>
                                {menuOpen && (
                                  <div className="absolute right-0 top-10 z-20 min-w-[160px] bg-white dark:bg-tribe-card border border-stone-200 dark:border-tribe-mid rounded-lg shadow-lg py-1">
                                    {canPin && (
                                      <button
                                        onClick={() => handleTogglePin(post)}
                                        className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid flex items-center gap-2"
                                      >
                                        {post.is_pinned ? (
                                          <>
                                            <PinOff className="w-4 h-4" /> {t.unpin}
                                          </>
                                        ) : (
                                          <>
                                            <Pin className="w-4 h-4" /> {t.pin}
                                          </>
                                        )}
                                      </button>
                                    )}
                                    {canReport && (
                                      <button
                                        onClick={() => handleReportPost(post.id)}
                                        className="w-full text-left px-3 py-2 text-sm text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid flex items-center gap-2"
                                      >
                                        <Flag className="w-4 h-4" /> {t.report}
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        onClick={() => handleDeletePost(post.id)}
                                        className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                                      >
                                        <Trash2 className="w-4 h-4" /> {t.delete}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Post content */}
                          <p className="text-theme-primary">{post.content}</p>

                          {/* Post media */}
                          {post.media_url && post.media_type === 'image' && (
                            <Image
                              src={post.media_url}
                              alt="Community post image"
                              width={600}
                              height={384}
                              className="w-full rounded-lg max-h-96 object-cover"
                              unoptimized
                            />
                          )}

                          {/* Post stats */}
                          <div className="flex gap-4 text-sm text-stone-600 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-tribe-card">
                            <button className="flex items-center gap-1 hover:text-red-500 transition">
                              <Heart className="w-4 h-4" />
                              {post.likes_count}
                            </button>
                            <Link
                              href={`/communities/${communityId}/post/${post.id}/comments`}
                              className="flex items-center gap-1 hover:text-tribe-green transition"
                            >
                              <MessageCircle className="w-4 h-4" />
                              {post.comments_count}
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-theme-primary font-medium">{t.noPosts2}</p>
                  </div>
                )}
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
              <div className="px-4 py-6">
                {members.length > 0 ? (
                  <div className="space-y-3">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between bg-white dark:bg-tribe-mid rounded-lg p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={member.user?.avatar_url || ''} alt={member.user?.name || 'User'} />
                            <AvatarFallback>{member.user?.name?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-theme-primary text-sm">{member.user?.name || 'Unknown'}</p>
                            {member.role !== 'member' && (
                              <span
                                className={`text-xs font-semibold ${
                                  member.role === 'admin' ? 'text-tribe-green' : 'text-blue-500'
                                }`}
                              >
                                {member.role === 'admin' ? t.admin : t.moderator}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-theme-primary font-medium">{t.noMembers}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!isMember && (
          <div className="px-4 py-12 text-center">
            <p className="text-theme-primary font-medium">{t.joinToContinue}</p>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
