'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { Trash2, Pin, Edit2, X, Check, Loader, Eye, Heart, ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';

interface InstructorPost {
  id: string;
  author_id: string;
  content: string;
  image_url?: string;
  video_url?: string;
  linked_session_id?: string;
  created_at: string;
  updated_at: string;
  is_pinned: boolean;
}

interface SessionOption {
  id: string;
  title: string;
  sport: string;
  date: string;
  price_cents: number;
  location: string;
}

interface PostStats {
  postId: string;
  likes: number;
  views: number;
}

const CHAR_LIMIT = 500;

export default function PromotePostsPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [posts, setPosts] = useState<InstructorPost[]>([]);
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formContent, setFormContent] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formLinkedSession, setFormLinkedSession] = useState('');
  const [formIsPinned, setFormIsPinned] = useState(false);

  // Edit state
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editLinkedSession, setEditLinkedSession] = useState('');
  const [editIsPinned, setEditIsPinned] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Stats
  const [postStats, setPostStats] = useState<Record<string, PostStats>>({});

  const t = {
    en: {
      yourPosts: 'Your Posts',
      postCount: (count: number) => `${count} post${count !== 1 ? 's' : ''}`,
      createPost: 'Create a Post',
      whatAnnounce: "What's your announcement?",
      imageUrl: 'Image URL (optional)',
      videoUrl: 'Video URL (optional)',
      linkedSession: 'Link to a Session (optional)',
      selectSession: 'Select a session',
      noSessions: 'No upcoming sessions',
      pinPost: 'Pin this post',
      publish: 'Publish',
      cancel: 'Cancel',
      delete: 'Delete',
      deleteConfirm: 'Are you sure? This cannot be undone.',
      edit: 'Edit',
      save: 'Save',
      characters: (current: number, max: number) => `${current} / ${max} characters`,
      noPostsYet: 'No posts yet. Create your first announcement!',
      views: 'views',
      likes: 'likes',
      unpin: 'Unpin',
      pin: 'Pin',
      errorLoading: 'Error loading posts',
      errorCreating: 'Error creating post',
      errorDeleting: 'Error deleting post',
      errorUpdating: 'Error updating post',
      successCreated: 'Post created!',
      successDeleted: 'Post deleted',
      successUpdated: 'Post updated',
      contentRequired: 'Post content is required',
      contentTooLong: 'Post is too long',
      notInstructor: 'Only instructors can create posts',
      contentPlaceholder: 'Share your announcement, class schedule, or training tip...',
    },
    es: {
      yourPosts: 'Tus Publicaciones',
      postCount: (count: number) => `${count} publicación${count !== 1 ? 'es' : ''}`,
      createPost: 'Crear una publicación',
      whatAnnounce: '¿Cuál es tu anuncio?',
      imageUrl: 'URL de imagen (opcional)',
      videoUrl: 'URL de video (opcional)',
      linkedSession: 'Vincular a una clase (opcional)',
      selectSession: 'Selecciona una clase',
      noSessions: 'Sin clases próximas',
      pinPost: 'Fijar esta publicación',
      publish: 'Publicar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      deleteConfirm: '¿Estás seguro? Esto no se puede deshacer.',
      edit: 'Editar',
      save: 'Guardar',
      characters: (current: number, max: number) => `${current} / ${max} caracteres`,
      noPostsYet: '¡Sin publicaciones aún. Crea tu primer anuncio!',
      views: 'vistas',
      likes: 'likes',
      unpin: 'Desfijar',
      pin: 'Fijar',
      errorLoading: 'Error cargando publicaciones',
      errorCreating: 'Error creando publicación',
      errorDeleting: 'Error eliminando publicación',
      errorUpdating: 'Error actualizando publicación',
      successCreated: '¡Publicación creada!',
      successDeleted: 'Publicación eliminada',
      successUpdated: 'Publicación actualizada',
      contentRequired: 'El contenido es requerido',
      contentTooLong: 'La publicación es muy larga',
      notInstructor: 'Solo los instructores pueden crear publicaciones',
      contentPlaceholder: 'Comparte tu anuncio, horario de clase o consejo de entrenamiento...',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;

  // Check auth and load data
  useEffect(() => {
    const initialize = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/auth/login');
          return;
        }

        setCurrentUserId(user.id);

        // Check if user is instructor
        const { data: userData } = await supabase.from('users').select('is_instructor').eq('id', user.id).single();

        const isInst = userData?.is_instructor || false;
        setIsInstructor(isInst);

        if (!isInst) {
          router.push('/dashboard');
          return;
        }

        // Load user's posts
        const { data: postsData, error: postsError } = await supabase
          .from('instructor_posts')
          .select('*')
          .eq('author_id', user.id)
          .order('created_at', { ascending: false });

        if (postsError) throw postsError;
        setPosts(postsData || []);

        // Load user's upcoming sessions
        const now = new Date().toISOString();
        const { data: sessionsData, error: sessionsError } = await supabase
          .from('sessions')
          .select('id, title, sport, date, price_cents, location')
          .eq('instructor_id', user.id)
          .gte('date', now)
          .order('date', { ascending: true });

        if (sessionsError) throw sessionsError;
        setSessions(sessionsData || []);

        // Load stats for all posts
        if (postsData && postsData.length > 0) {
          const postIds = postsData.map((p: InstructorPost) => p.id);

          const { data: likesData } = await supabase.from('post_likes').select('post_id').in('post_id', postIds);

          const { data: viewsData } = await supabase.from('post_views').select('post_id').in('post_id', postIds);

          const likeCounts: Record<string, number> = {};
          likesData?.forEach((like: { post_id: string }) => {
            likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1;
          });

          const viewCounts: Record<string, number> = {};
          viewsData?.forEach((view: { post_id: string }) => {
            viewCounts[view.post_id] = (viewCounts[view.post_id] || 0) + 1;
          });

          const stats: Record<string, PostStats> = {};
          postIds.forEach((id) => {
            stats[id] = {
              postId: id,
              likes: likeCounts[id] || 0,
              views: viewCounts[id] || 0,
            };
          });
          setPostStats(stats);
        }
      } catch (error) {
        console.error('Error initializing:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [supabase, router]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId || !isInstructor) return;

    if (!formContent.trim()) {
      alert(strings.contentRequired);
      return;
    }

    if (formContent.length > CHAR_LIMIT) {
      alert(strings.contentTooLong);
      return;
    }

    setSubmitting(true);

    try {
      const { data: newPost, error } = await supabase
        .from('instructor_posts')
        .insert({
          author_id: currentUserId,
          content: formContent,
          image_url: formImageUrl || null,
          linked_session_id: formLinkedSession || null,
          is_pinned: formIsPinned,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Add to posts list
      setPosts([newPost, ...posts]);
      setPostStats({
        ...postStats,
        [newPost.id]: {
          postId: newPost.id,
          likes: 0,
          views: 0,
        },
      });

      // Reset form
      setFormContent('');
      setFormImageUrl('');
      setFormLinkedSession('');
      setFormIsPinned(false);

      alert(strings.successCreated);
    } catch (error) {
      console.error('Error creating post:', error);
      alert(strings.errorCreating);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('instructor_posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', currentUserId);

      if (error) throw error;

      setPosts(posts.filter((p) => p.id !== postId));
      setDeleteConfirm(null);
      alert(strings.successDeleted);
    } catch (error) {
      console.error('Error deleting post:', error);
      alert(strings.errorDeleting);
    }
  };

  const handleStartEdit = (post: InstructorPost) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
    setEditImageUrl(post.image_url || '');
    setEditLinkedSession(post.linked_session_id || '');
    setEditIsPinned(post.is_pinned);
  };

  const handleSaveEdit = async (postId: string) => {
    if (!currentUserId) return;

    if (!editContent.trim()) {
      alert(strings.contentRequired);
      return;
    }

    if (editContent.length > CHAR_LIMIT) {
      alert(strings.contentTooLong);
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('instructor_posts')
        .update({
          content: editContent,
          image_url: editImageUrl || null,
          linked_session_id: editLinkedSession || null,
          is_pinned: editIsPinned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId)
        .eq('author_id', currentUserId);

      if (error) throw error;

      // Update posts list
      setPosts(
        posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                content: editContent,
                image_url: editImageUrl || undefined,
                linked_session_id: editLinkedSession || undefined,
                is_pinned: editIsPinned,
                updated_at: new Date().toISOString(),
              }
            : p
        )
      );

      setEditingPostId(null);
      alert(strings.successUpdated);
    } catch (error) {
      console.error('Error updating post:', error);
      alert(strings.errorUpdating);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (post: InstructorPost) => {
    await handleSaveEdit(post.id);
  };

  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return language === 'es' ? `hace ${seconds}s` : `${seconds}s ago`;
    if (seconds < 3600)
      return language === 'es' ? `hace ${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)
      return language === 'es' ? `hace ${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 3600)}h ago`;
    return language === 'es' ? `hace ${Math.floor(seconds / 86400)}d` : `${Math.floor(seconds / 86400)}d ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-tribe-green" />
          <p className="text-theme-secondary">{strings.errorLoading}</p>
        </div>
      </div>
    );
  }

  if (!isInstructor) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-secondary">{strings.notInstructor}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link
            href="/promote"
            className="flex items-center gap-2 text-tribe-green hover:text-tribe-green/80 transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 ml-3">
            <h1 className="text-lg font-bold text-theme-primary">{strings.yourPosts}</h1>
            <p className="text-xs text-theme-secondary">{strings.postCount(posts.length)}</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Create Post Form */}
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
          <h2 className="mb-4 text-base font-semibold text-theme-primary">{strings.createPost}</h2>

          <form onSubmit={handleCreatePost} className="space-y-4">
            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-theme-primary">{strings.whatAnnounce}</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder={strings.contentPlaceholder}
                maxLength={CHAR_LIMIT}
                rows={4}
                className="mt-2 w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:border-tribe-green focus:outline-none"
              />
              <div className="mt-1 flex justify-between">
                <span></span>
                <span className="text-xs text-theme-secondary">
                  {strings.characters(formContent.length, CHAR_LIMIT)}
                </span>
              </div>
            </div>

            {/* Image URL */}
            <div>
              <label className="block text-sm font-medium text-theme-primary">{strings.imageUrl}</label>
              <input
                type="url"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="mt-2 w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:border-tribe-green focus:outline-none"
              />
            </div>

            {/* Linked Session */}
            <div>
              <label className="block text-sm font-medium text-theme-primary">{strings.linkedSession}</label>
              <select
                value={formLinkedSession}
                onChange={(e) => setFormLinkedSession(e.target.value)}
                className="mt-2 w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:border-tribe-green focus:outline-none"
              >
                <option value="">{strings.selectSession}</option>
                {sessions.length === 0 ? (
                  <option disabled>{strings.noSessions}</option>
                ) : (
                  sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title} - {new Date(session.date).toLocaleDateString()}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Pin Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="pin-post"
                checked={formIsPinned}
                onChange={(e) => setFormIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-stone-200 dark:border-[#52575D] bg-white dark:bg-tribe-surface text-tribe-green focus:ring-tribe-green"
              />
              <label htmlFor="pin-post" className="text-sm font-medium text-theme-primary">
                {strings.pinPost}
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-tribe-green text-slate-900 hover:bg-tribe-green font-semibold rounded-xl py-3 transition disabled:opacity-50"
              >
                {submitting ? strings.errorLoading : strings.publish}
              </button>
            </div>
          </form>
        </div>

        {/* Posts List */}
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 py-12">
            <p className="text-center text-theme-secondary">{strings.noPostsYet}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700"
              >
                {editingPostId === post.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    {/* Edit Content */}
                    <div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        maxLength={CHAR_LIMIT}
                        rows={4}
                        className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:border-tribe-green focus:outline-none"
                      />
                      <div className="mt-1 flex justify-between">
                        <span></span>
                        <span className="text-xs text-theme-secondary">
                          {strings.characters(editContent.length, CHAR_LIMIT)}
                        </span>
                      </div>
                    </div>

                    {/* Edit Image URL */}
                    <input
                      type="url"
                      value={editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      placeholder={strings.imageUrl}
                      className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:border-tribe-green focus:outline-none"
                    />

                    {/* Edit Linked Session */}
                    <select
                      value={editLinkedSession}
                      onChange={(e) => setEditLinkedSession(e.target.value)}
                      className="w-full bg-white dark:bg-tribe-surface border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:border-tribe-green focus:outline-none"
                    >
                      <option value="">{strings.selectSession}</option>
                      {sessions.map((session) => (
                        <option key={session.id} value={session.id}>
                          {session.title} - {new Date(session.date).toLocaleDateString()}
                        </option>
                      ))}
                    </select>

                    {/* Edit Pin Toggle */}
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id={`pin-${post.id}`}
                        checked={editIsPinned}
                        onChange={(e) => setEditIsPinned(e.target.checked)}
                        className="h-4 w-4 rounded border-stone-200 dark:border-[#52575D] bg-white dark:bg-tribe-surface text-tribe-green focus:ring-tribe-green"
                      />
                      <label htmlFor={`pin-${post.id}`} className="text-sm font-medium text-theme-primary">
                        {strings.pinPost}
                      </label>
                    </div>

                    {/* Edit Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleSaveEdit(post.id)}
                        disabled={submitting}
                        className="flex-1 flex items-center justify-center gap-2 bg-tribe-green text-slate-900 hover:bg-tribe-green font-semibold rounded-xl py-2 transition disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        {strings.save}
                      </button>
                      <button
                        onClick={() => setEditingPostId(null)}
                        className="flex-1 flex items-center justify-center gap-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-2 font-semibold transition"
                      >
                        <X className="h-4 w-4" />
                        {strings.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <>
                    {/* Pin Badge */}
                    {post.is_pinned && (
                      <div className="mb-3 inline-block bg-tribe-green/20 text-tribe-green rounded-full px-3 py-1">
                        <span className="text-xs font-semibold">{language === 'es' ? 'Fijado' : 'Pinned'}</span>
                      </div>
                    )}

                    {/* Content */}
                    <p className="mb-3 whitespace-pre-wrap text-theme-primary">{post.content}</p>

                    {/* Image Preview */}
                    {post.image_url && (
                      <div className="mb-3 flex items-center justify-center rounded-lg bg-stone-100 dark:bg-tribe-surface">
                        <Image
                          src={post.image_url}
                          alt="Post media"
                          width={500}
                          height={400}
                          className="max-h-48 w-auto rounded-lg"
                        />
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="mb-4 flex items-center gap-4 text-sm text-theme-secondary">
                      <span>{timeAgo(post.created_at)}</span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          <span>
                            {postStats[post.id]?.likes || 0} {strings.likes}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          <span>
                            {postStats[post.id]?.views || 0} {strings.views}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 border-t border-stone-200 dark:border-gray-700 pt-4">
                      <button
                        onClick={() => handleStartEdit(post)}
                        className="flex items-center gap-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl px-4 py-2 text-sm font-medium transition"
                      >
                        <Edit2 className="h-4 w-4" />
                        {strings.edit}
                      </button>

                      <button
                        onClick={() => {
                          setEditingPostId(post.id);
                          setEditIsPinned(!post.is_pinned);
                          setEditContent(post.content);
                          setEditImageUrl(post.image_url || '');
                          setEditLinkedSession(post.linked_session_id || '');
                        }}
                        className="flex items-center gap-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl px-4 py-2 text-sm font-medium transition"
                      >
                        <Pin className="h-4 w-4" />
                        {post.is_pinned ? strings.unpin : strings.pin}
                      </button>

                      {deleteConfirm === post.id ? (
                        <>
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="flex items-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl px-4 py-2 text-sm font-medium transition"
                          >
                            <Check className="h-4 w-4" />
                            {language === 'es' ? 'Confirmar' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex items-center gap-2 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl px-4 py-2 text-sm font-medium transition"
                          >
                            <X className="h-4 w-4" />
                            {strings.cancel}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(post.id)}
                          className="flex items-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-xl px-4 py-2 text-sm font-medium transition"
                        >
                          <Trash2 className="h-4 w-4" />
                          {strings.delete}
                        </button>
                      )}
                    </div>

                    {/* Delete Confirmation Message */}
                    {deleteConfirm === post.id && (
                      <p className="mt-3 text-sm text-red-600 dark:text-red-400">{strings.deleteConfirm}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
