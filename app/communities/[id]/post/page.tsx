'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { insertCommunityPost } from '@/lib/dal/communities';
import { compressImage } from '@/components/session/recapPhotosHelpers';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { ChevronLeft, Loader2, ImagePlus, X } from 'lucide-react';

const MAX_CHARS = 500;

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Nueva Publicación' : 'New Post',
  what: language === 'es' ? '¿Qué deseas compartir?' : "What's on your mind?",
  addImage: language === 'es' ? 'Agregar imagen' : 'Add image',
  removeImage: language === 'es' ? 'Quitar imagen' : 'Remove image',
  post: language === 'es' ? 'Publicar' : 'Post',
  posting: language === 'es' ? 'Publicando...' : 'Posting...',
  required: language === 'es' ? 'Por favor escribe algo' : 'Please write something',
  error: language === 'es' ? 'Error al publicar' : 'Error posting',
  success: language === 'es' ? 'Publicación creada' : 'Post created',
  cancel: language === 'es' ? 'Cancelar' : 'Cancel',
  charsLeft: (n: number) => (language === 'es' ? `${n} caracteres restantes` : `${n} characters left`),
  uploadFailed: language === 'es' ? 'No se pudo subir la imagen' : 'Failed to upload image',
});

export default function NewPostPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const communityId = params?.id as string;

  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
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

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadImage(file: File): Promise<string> {
    const compressed = await compressImage(file);
    const path = `community-posts/${communityId}/${userId}/post-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }

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
    if (content.length > MAX_CHARS) {
      setError(t.error);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let mediaUrl: string | undefined;
      let mediaType: string | undefined;
      if (imageFile) {
        try {
          mediaUrl = await uploadImage(imageFile);
          mediaType = 'image';
        } catch (uploadErr) {
          logError(uploadErr, { action: 'uploadCommunityPostImage' });
          await haptic('error');
          showError(t.uploadFailed);
          setLoading(false);
          return;
        }
      }

      const result = await insertCommunityPost(supabase, {
        community_id: communityId,
        author_id: userId,
        content: content.trim(),
        media_url: mediaUrl,
        media_type: mediaType,
      });

      if (!result.success) {
        await haptic('error');
        showError(result.error || t.error);
        setError(result.error || t.error);
        setLoading(false);
        return;
      }

      await haptic('success');
      showSuccess(t.success);
      router.push(`/communities/${communityId}`);
    } catch (err) {
      logError(err, { action: 'insertCommunityPost' });
      await haptic('error');
      showError(t.error);
      setError(t.error);
      setLoading(false);
    }
  }

  const charsLeft = MAX_CHARS - content.length;
  const overLimit = charsLeft < 0;

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
            aria-label={t.cancel}
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
          <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-tribe-mid">
            <Avatar className="w-12 h-12">
              <AvatarImage src={userProfile?.avatar_url || ''} alt={userProfile?.name || 'User'} />
              <AvatarFallback>{userProfile?.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-theme-primary">{userProfile?.name || 'User'}</p>
            </div>
          </div>

          {/* Content textarea + char counter */}
          <div className="space-y-2">
            <textarea
              placeholder={t.what}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError('');
              }}
              rows={6}
              maxLength={MAX_CHARS}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent resize-none"
              autoFocus
            />
            <div className="flex justify-between items-center">
              {error ? <p className="text-red-500 text-sm">{error}</p> : <span />}
              <p className={`text-xs ${overLimit ? 'text-red-500' : 'text-stone-500 dark:text-gray-400'}`}>
                {t.charsLeft(charsLeft)}
              </p>
            </div>
          </div>

          {/* Image upload */}
          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFilePicked} className="hidden" />
            {!imagePreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 border border-stone-300 dark:border-tribe-card rounded-lg text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid transition text-sm"
              >
                <ImagePlus className="w-4 h-4" />
                {t.addImage}
              </button>
            ) : (
              <div className="relative rounded-lg overflow-hidden">
                <Image
                  src={imagePreview}
                  alt="Selected image preview"
                  width={600}
                  height={256}
                  className="w-full max-h-64 object-cover"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={clearImage}
                  className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-black/90 transition"
                  aria-label={t.removeImage}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Submit button */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-6 py-3 border-2 border-stone-300 dark:border-tribe-card rounded-lg font-semibold text-theme-primary hover:bg-stone-100 dark:hover:bg-tribe-mid transition"
            >
              {t.cancel}
            </button>
            <Button
              type="submit"
              disabled={loading || !content.trim() || overLimit}
              className="flex-1 bg-tribe-green hover:bg-tribe-green text-slate-900 font-semibold h-12 rounded-lg transition"
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
