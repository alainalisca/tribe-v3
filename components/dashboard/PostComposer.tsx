'use client';

/**
 * Instructor post composer. Opens as a bottom-sheet / centered modal, lets an
 * instructor pick a post type, write a body (EN required, ES optional),
 * optionally attach one image, and optionally link an upcoming session.
 *
 * Media upload:
 *   - Goes to the Supabase 'instructor-posts' storage bucket (create if missing).
 *   - Images only for now; size-capped client-side. Video support is a follow-up.
 */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Image as ImageIcon, Loader } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createPost, type PostType } from '@/lib/dal/instructorPosts';
import { showSuccess, showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { trackEvent } from '@/lib/analytics';

interface PostComposerProps {
  open: boolean;
  onClose: () => void;
  instructorId: string;
  language: 'en' | 'es';
  /** Called after a successful post so the parent can refresh the feed. */
  onPosted?: (postId: string) => void;
}

interface UpcomingSessionLite {
  id: string;
  title: string | null;
  date: string;
  sport: string | null;
}

const POST_TYPES: { key: PostType; emoji: string }[] = [
  { key: 'text', emoji: '💬' },
  { key: 'tip', emoji: '💡' },
  { key: 'workout', emoji: '🏋️' },
  { key: 'photo', emoji: '📸' },
  { key: 'session_preview', emoji: '📅' },
];

const MAX_BODY = 1000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export default function PostComposer({ open, onClose, instructorId, language, onPosted }: PostComposerProps) {
  const supabase = createClient();

  const [postType, setPostType] = useState<PostType>('text');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [bodyEs, setBodyEs] = useState('');
  const [showSpanish, setShowSpanish] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linkedSessionId, setLinkedSessionId] = useState<string>('');
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingSessionLite[]>([]);
  const [saving, setSaving] = useState(false);

  // Load the instructor's upcoming sessions once so the "link a session" dropdown
  // can populate. Intentionally narrow select to keep payload small.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('sessions')
        .select('id, title, date, sport')
        .eq('creator_id', instructorId)
        .eq('status', 'active')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(20);
      if (cancelled) return;
      setUpcomingSessions((data as UpcomingSessionLite[] | null) || []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, instructorId, supabase]);

  const t = {
    title: language === 'es' ? 'Nueva Publicación' : 'Share an Update',
    close: language === 'es' ? 'Cerrar' : 'Close',
    pickType: language === 'es' ? 'Tipo' : 'Type',
    titleLabel: language === 'es' ? 'Título (opcional)' : 'Title (optional)',
    bodyLabel: language === 'es' ? 'Contenido' : 'Content',
    bodyPlaceholder:
      language === 'es' ? 'Comparte un consejo, entrenamiento o actualización…' : 'Share a tip, workout, or update…',
    bodyEsLabel: language === 'es' ? 'Versión en español' : 'Also write in Spanish',
    addPhoto: language === 'es' ? 'Agregar foto' : 'Add photo',
    removePhoto: language === 'es' ? 'Quitar' : 'Remove',
    linkSession: language === 'es' ? 'Enlazar sesión (opcional)' : 'Link a session (optional)',
    none: language === 'es' ? 'Ninguna' : 'None',
    post: language === 'es' ? 'Publicar' : 'Post',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    bodyRequired: language === 'es' ? 'Escribe algo antes de publicar' : 'Write something before posting',
    imageTooLarge: language === 'es' ? 'La imagen es muy grande (máx 5MB)' : 'Image too large (max 5MB)',
    posting: language === 'es' ? 'Publicando…' : 'Posting…',
    success: language === 'es' ? 'Publicado' : 'Posted',
    error: language === 'es' ? 'No se pudo publicar' : 'Could not post',
  };

  const typeLabel: Record<PostType, string> = {
    text: language === 'es' ? 'Texto' : 'Text',
    tip: language === 'es' ? 'Consejo' : 'Tip',
    workout: language === 'es' ? 'Entrenamiento' : 'Workout',
    photo: language === 'es' ? 'Foto' : 'Photo',
    video: language === 'es' ? 'Video' : 'Video',
    session_preview: language === 'es' ? 'Próxima Sesión' : 'Upcoming Session',
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) {
      showError(t.imageTooLarge);
      return;
    }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
    // If user added an image on a 'text' type, auto-promote to 'photo'.
    if (postType === 'text') setPostType('photo');
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
  };

  const reset = () => {
    setPostType('text');
    setTitle('');
    setBody('');
    setBodyEs('');
    setShowSpanish(false);
    setLinkedSessionId('');
    handleRemoveImage();
  };

  const handleSubmit = async () => {
    if (!body.trim()) {
      showError(t.bodyRequired);
      return;
    }
    setSaving(true);

    let uploadedUrl: string | null = null;
    if (imageFile) {
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const fileName = `${instructorId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('instructor-posts')
        .upload(fileName, imageFile, { contentType: imageFile.type, upsert: false });
      if (upErr) {
        showError(upErr.message || t.error);
        setSaving(false);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from('instructor-posts').getPublicUrl(fileName);
      uploadedUrl = publicUrl;
    }

    const res = await createPost(supabase, {
      instructorId,
      postType,
      title: title.trim() || undefined,
      body: body.trim(),
      bodyEs: showSpanish && bodyEs.trim() ? bodyEs.trim() : undefined,
      mediaUrls: uploadedUrl ? [uploadedUrl] : undefined,
      linkedSessionId: linkedSessionId || undefined,
    });

    setSaving(false);
    if (!res.success || !res.data) {
      showError(res.error || t.error);
      return;
    }
    await haptic('success');
    showSuccess(t.success);
    trackEvent('post_created', { post_id: res.data.id, post_type: postType });
    onPosted?.(res.data.id);
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-tribe-card rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-theme-primary">{t.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-surface"
            aria-label={t.close}
          >
            <X className="w-5 h-5 text-theme-secondary" />
          </button>
        </div>

        {/* Type chips */}
        <p className="text-xs text-theme-secondary mb-1">{t.pickType}</p>
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {POST_TYPES.map((pt) => (
            <button
              key={pt.key}
              type="button"
              onClick={() => setPostType(pt.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                postType === pt.key
                  ? 'bg-[#84cc16] text-slate-900'
                  : 'bg-stone-100 dark:bg-tribe-surface text-theme-secondary'
              }`}
            >
              <span className="mr-1">{pt.emoji}</span>
              {typeLabel[pt.key]}
            </button>
          ))}
        </div>

        {/* Title */}
        {(postType === 'tip' || postType === 'workout') && (
          <div className="mb-3">
            <label htmlFor="post-title" className="block text-xs text-theme-secondary mb-1">
              {t.titleLabel}
            </label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              className="w-full px-3 py-2 rounded-lg bg-stone-100 dark:bg-tribe-surface text-theme-primary text-sm"
            />
          </div>
        )}

        {/* Body */}
        <label htmlFor="post-body" className="block text-xs text-theme-secondary mb-1">
          {t.bodyLabel}
        </label>
        <textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          rows={4}
          placeholder={t.bodyPlaceholder}
          className="w-full px-3 py-2 rounded-lg bg-stone-100 dark:bg-tribe-surface text-theme-primary text-sm resize-none"
        />
        <p className="text-[10px] text-theme-secondary text-right mb-3">
          {body.length}/{MAX_BODY}
        </p>

        {/* Spanish toggle */}
        <label className="flex items-center gap-2 text-xs text-theme-secondary mb-3 cursor-pointer">
          <input type="checkbox" checked={showSpanish} onChange={(e) => setShowSpanish(e.target.checked)} />
          {t.bodyEsLabel}
        </label>
        {showSpanish && (
          <textarea
            value={bodyEs}
            onChange={(e) => setBodyEs(e.target.value.slice(0, MAX_BODY))}
            rows={3}
            placeholder="Versión en español…"
            className="w-full mb-3 px-3 py-2 rounded-lg bg-stone-100 dark:bg-tribe-surface text-theme-primary text-sm resize-none"
          />
        )}

        {/* Image upload */}
        <div className="mb-3">
          {imagePreview ? (
            <div className="relative rounded-lg overflow-hidden aspect-video bg-black">
              <Image
                src={imagePreview}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-cover"
                unoptimized
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black"
                aria-label={t.removePhoto}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-stone-300 dark:border-tribe-mid text-sm text-theme-secondary cursor-pointer hover:text-theme-primary">
              <ImageIcon className="w-4 h-4" />
              {t.addPhoto}
              <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </label>
          )}
        </div>

        {/* Linked session */}
        {upcomingSessions.length > 0 && (
          <div className="mb-4">
            <label htmlFor="post-link-session" className="block text-xs text-theme-secondary mb-1">
              {t.linkSession}
            </label>
            <select
              id="post-link-session"
              value={linkedSessionId}
              onChange={(e) => setLinkedSessionId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-stone-100 dark:bg-tribe-surface text-theme-primary text-sm"
            >
              <option value="">{t.none}</option>
              {upcomingSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date} — {s.title || s.sport || 'Session'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-lg bg-stone-200 dark:bg-tribe-surface text-theme-primary text-sm disabled:opacity-50"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !body.trim()}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-50"
          >
            {saving && <Loader className="w-4 h-4 animate-spin" />}
            {saving ? t.posting : t.post}
          </button>
        </div>
      </div>
    </div>
  );
}
