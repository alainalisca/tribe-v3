'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
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
  type CommunityWithCreator,
  type CommunityPostWithAuthor,
  type CommunityMemberWithUser,
} from '@/lib/dal/communities';
import { sportTranslations } from '@/lib/translations';
import Image from 'next/image';
import { ChevronLeft, Users, MessageCircle, Heart, Trash2, Loader2, Plus } from 'lucide-react';

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
});

export default function CommunityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const communityId = params?.id as string;

  const [community, setCommunity] = useState<CommunityWithCreator | null>(null);
  const [posts, setPosts] = useState<CommunityPostWithAuthor[]>([]);
  const [members, setMembers] = useState<CommunityMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'members'>('posts');
  const [joining, setJoining] = useState(false);

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
        setPosts(postsResult.data || []);
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

  if (loading || !community) {
    return (
      <div className="min-h-screen bg-white dark:bg-tribe-surface pb-24">
        <div className="max-w-2xl mx-auto px-4 py-8">
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
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-lg font-bold text-theme-primary flex-1 truncate">{community.name}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {/* Cover image */}
        <div className="w-full h-48 bg-cover bg-center" style={coverStyle} />

        {/* Community info */}
        <div className="px-4 py-6 space-y-4 border-b border-gray-200 dark:border-tribe-mid">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-theme-primary">{community.name}</h2>
            {sportName && <p className="text-sm text-tribe-green font-semibold">{sportName}</p>}
          </div>

          {community.description && <p className="text-theme-primary">{community.description}</p>}

          {community.location_name && (
            <p className="text-sm text-stone-600 dark:text-gray-400">📍 {community.location_name}</p>
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
                {/* New post FAB */}
                <Link
                  href={`/communities/${communityId}/post`}
                  className="flex items-center gap-2 px-4 py-3 bg-tribe-green text-slate-900 rounded-lg hover:bg-tribe-green font-medium transition"
                >
                  <Plus className="w-5 h-5" />
                  {t.newPost}
                </Link>

                {posts.length > 0 ? (
                  <div className="space-y-4">
                    {posts.map((post) => (
                      <div key={post.id} className="bg-white dark:bg-tribe-mid rounded-lg p-4 space-y-3">
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
                          </div>

                          {/* Delete button for authors/admins */}
                          {(userId === post.author_id ||
                            members.find((m) => m.user_id === userId)?.role !== 'member') && (
                            <button
                              onClick={async () => {
                                // Delete post logic here
                                if (confirm(t.deleteConfirm)) {
                                  // Call delete API
                                  await fetchCommunityData();
                                }
                              }}
                              className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          )}
                        </div>

                        {/* Post content */}
                        <p className="text-theme-primary">{post.content}</p>

                        {/* Post media */}
                        {post.media_url && post.media_type === 'image' && (
                          <Image src={post.media_url} alt="Community post image" width={600} height={384} className="w-full rounded-lg max-h-96 object-cover" unoptimized />
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
                    ))}
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
