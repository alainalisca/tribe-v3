'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { insertCommunityPost } from '@/lib/dal/communities';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Nueva Publicación' : 'New Post',
  backButton: language === 'es' ? 'Volver' : 'Back',
  what: language === 'es' ? '¿Qué deseas compartir?' : "What's on your mind?",
  imageUrl: language === 'es' ? 'URL de Imagen (Opcional)' : 'Image URL (Optional)',
  imageUrlHint: language === 'es' ? 'Enlace a una imagen' : 'Link to an image',
  post: language === 'es' ? 'Publicar' : 'Post',
  posting: language === 'es' ? 'Publicando...' : 'Posting...',
  required: language === 'es' ? 'Por favor escribe algo' : 'Please write something',
  error: language === 'es' ? 'Error al publicar' : 'Error posting',
});

export default function NewPostPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const communityId = params?.id as string;

  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<{ name: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      setUserId(user.id);

      // Fetch user profile
      const { data, error: profileError } = await supabase
        .from('users')
        .select('name, avatar_url')
        .eq('id', user.id)
        .single();

      if (!profileError && data) {
        setUserProfile(data);
      }
    }
    getUser();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!content.trim()) {
      setError(t.required);
      return;
    }

    if (!userId) {
      setError('User not found');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await insertCommunityPost(supabase, {
        community_id: communityId,
        author_id: userId,
        content: content.trim(),
        media_url: imageUrl || undefined,
        media_type: imageUrl ? 'image' : undefined,
      });

      if (!result.success) {
        setError(result.error || t.error);
        setLoading(false);
        return;
      }

      // Redirect back to community
      router.push(`/communities/${communityId}`);
    } catch (err) {
      logError(err, { action: 'insertCommunityPost' });
      setError(t.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#3D4349]">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-[#404549] border-b border-gray-200 dark:border-[#52575D] z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-lg transition"
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-2xl font-bold text-theme-primary">{t.title}</h1>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* User info */}
          <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-[#52575D]">
            <Avatar className="w-12 h-12">
              <AvatarImage src={userProfile?.avatar_url || ''} alt={userProfile?.name || 'User'} />
              <AvatarFallback>{userProfile?.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-theme-primary">{userProfile?.name || 'User'}</p>
            </div>
          </div>

          {/* Content textarea */}
          <div className="space-y-2">
            <textarea
              placeholder={t.what}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError('');
              }}
              rows={6}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-[#52575D] rounded-lg border border-stone-200 dark:border-[#6B7178] text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent resize-none"
              autoFocus
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.imageUrl}</label>
            <p className="text-xs text-stone-500 dark:text-gray-400">{t.imageUrlHint}</p>
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-[#52575D] rounded-lg border border-stone-200 dark:border-[#6B7178] text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent"
            />

            {/* Image preview */}
            {imageUrl && (
              <div className="mt-3 rounded-lg overflow-hidden">
                <img src={imageUrl} alt="Preview" className="w-full max-h-64 object-cover" />
              </div>
            )}
          </div>

          {/* Submit button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-6 py-3 border-2 border-stone-300 dark:border-[#6B7178] rounded-lg font-semibold text-theme-primary hover:bg-stone-100 dark:hover:bg-[#52575D] transition"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
            <Button
              type="submit"
              disabled={loading || !content.trim()}
              className="flex-1 bg-tribe-green hover:bg-[#92d31f] text-slate-900 font-semibold h-12 rounded-lg transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  {t.posting}
                </>
              ) : (
                t.post
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
