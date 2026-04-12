'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { fetchApprovedBulletinPosts, createBulletinPost, type BulletinPost } from '@/lib/dal/communityBulletin';
import { SkeletonCard } from '@/components/Skeleton';
import { Plus, MapPin, Calendar, Clock, ExternalLink, ChevronDown, ChevronUp, Send } from 'lucide-react';

const CATEGORIES: { key: string; en: string; es: string }[] = [
  { key: 'all', en: 'All', es: 'Todos' },
  { key: 'event', en: 'Events', es: 'Eventos' },
  { key: 'meetup', en: 'Meetups', es: 'Encuentros' },
  { key: 'social', en: 'Social', es: 'Social' },
  { key: 'announcement', en: 'Announcements', es: 'Anuncios' },
  { key: 'other', en: 'Other', es: 'Otros' },
];

const CATEGORY_COLORS: Record<string, string> = {
  event: 'bg-blue-500/20 text-blue-400',
  meetup: 'bg-purple-500/20 text-purple-400',
  social: 'bg-pink-500/20 text-pink-400',
  announcement: 'bg-amber-500/20 text-amber-400',
  other: 'bg-stone-500/20 text-stone-400',
};

const t = (lang: 'en' | 'es') => ({
  submitPost: lang === 'es' ? 'Publicar' : 'Submit a Post',
  title: lang === 'es' ? 'Titulo' : 'Title',
  description: lang === 'es' ? 'Descripcion' : 'Description',
  category: lang === 'es' ? 'Categoria' : 'Category',
  eventDate: lang === 'es' ? 'Fecha' : 'Event Date',
  eventTime: lang === 'es' ? 'Hora' : 'Event Time',
  location: lang === 'es' ? 'Ubicacion' : 'Location',
  imageUrl: lang === 'es' ? 'URL del flyer (imagen)' : 'Flyer Image URL',
  externalUrl: lang === 'es' ? 'Enlace externo' : 'External Link',
  submit: lang === 'es' ? 'Enviar' : 'Submit',
  submitting: lang === 'es' ? 'Enviando...' : 'Submitting...',
  successMsg: lang === 'es' ? 'Enviado para revision!' : 'Submitted for review!',
  errorMsg: lang === 'es' ? 'No se pudo enviar el post' : 'Failed to submit post',
  noPosts: lang === 'es' ? 'No hay publicaciones aun' : 'No posts yet',
  noPostsDesc: lang === 'es' ? 'Se el primero en publicar un evento!' : 'Be the first to post an event!',
  loginRequired: lang === 'es' ? 'Inicia sesion para publicar' : 'Log in to post',
});

function BulletinCard({ post, language }: { post: BulletinPost; language: 'en' | 'es' }) {
  const desc = language === 'es' && post.description_es ? post.description_es : post.description_en;
  const badgeColor = CATEGORY_COLORS[post.category] || CATEGORY_COLORS.other;
  const catLabel = CATEGORIES.find((c) => c.key === post.category);

  return (
    <div className="rounded-xl bg-white dark:bg-[#272D34] border border-stone-200 dark:border-[#52575D] overflow-hidden">
      {post.image_url && (
        <div className="h-44 w-full overflow-hidden">
          <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
            {catLabel ? (language === 'es' ? catLabel.es : catLabel.en) : post.category}
          </span>
          {post.author && <span className="text-xs text-stone-400 dark:text-gray-500">{post.author.name}</span>}
        </div>
        <h3 className="font-semibold text-theme-primary text-sm leading-snug">{post.title}</h3>
        {desc && <p className="text-xs text-stone-500 dark:text-gray-400 line-clamp-3 leading-relaxed">{desc}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400 dark:text-gray-500 pt-1">
          {post.event_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(post.event_date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
          {post.event_time && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {post.event_time.slice(0, 5)}
            </span>
          )}
          {post.location_name && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {post.location_name}
            </span>
          )}
        </div>
        {post.external_url && (
          <a
            href={post.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[#A3E635] text-xs font-medium pt-1"
          >
            {language === 'es' ? 'Ver mas' : 'Learn more'}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function CommunityBulletinTab() {
  const supabase = createClient();
  const { language } = useLanguage();
  const labels = t(language);

  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'event',
    event_date: '',
    event_time: '',
    location_name: '',
    image_url: '',
    external_url: '',
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    loadPosts();
  }, [selectedCategory]);

  async function loadPosts() {
    try {
      setLoading(true);
      const result = await fetchApprovedBulletinPosts(supabase, {
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      });
      if (result.success) setPosts(result.data || []);
    } catch (error) {
      logError(error, { action: 'loadBulletinPosts' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setSubmitting(true);
    try {
      const result = await createBulletinPost(supabase, {
        author_id: userId,
        title: form.title,
        description_en: form.description || null,
        description_es: null,
        category: form.category,
        event_date: form.event_date || null,
        event_time: form.event_time || null,
        location_name: form.location_name || null,
        image_url: form.image_url || null,
        external_url: form.external_url || null,
      });
      if (result.success) {
        showSuccess(labels.successMsg);
        setForm({
          title: '',
          description: '',
          category: 'event',
          event_date: '',
          event_time: '',
          location_name: '',
          image_url: '',
          external_url: '',
        });
        setShowForm(false);
      } else {
        showError(result.error || labels.errorMsg);
      }
    } catch (error) {
      logError(error, { action: 'submitBulletinPost' });
      showError(labels.errorMsg);
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    'w-full px-3 py-2 bg-stone-100 dark:bg-[#52575D] rounded-lg border border-stone-200 dark:border-[#6B7178] text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent text-sm';

  return (
    <div className="space-y-4">
      {/* Submit CTA */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-tribe-green text-slate-900 rounded-xl font-semibold text-sm hover:bg-[#92d31f] transition"
      >
        {showForm ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {labels.submitPost}
      </button>

      {/* Collapsible form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="space-y-3 p-4 rounded-xl bg-white dark:bg-[#272D34] border border-stone-200 dark:border-[#52575D]"
        >
          {!userId && <p className="text-xs text-red-400 text-center">{labels.loginRequired}</p>}
          <input
            required
            placeholder={labels.title}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className={inputCls}
          />
          <textarea
            placeholder={labels.description}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className={inputCls}
          />
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={inputCls}
          >
            {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
              <option key={c.key} value={c.key}>
                {language === 'es' ? c.es : c.en}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              placeholder={labels.eventDate}
              value={form.event_date}
              onChange={(e) => setForm({ ...form, event_date: e.target.value })}
              className={inputCls}
            />
            <input
              type="time"
              placeholder={labels.eventTime}
              value={form.event_time}
              onChange={(e) => setForm({ ...form, event_time: e.target.value })}
              className={inputCls}
            />
          </div>
          <input
            placeholder={labels.location}
            value={form.location_name}
            onChange={(e) => setForm({ ...form, location_name: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder={labels.imageUrl}
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            className={inputCls}
          />
          <input
            placeholder={labels.externalUrl}
            value={form.external_url}
            onChange={(e) => setForm({ ...form, external_url: e.target.value })}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={submitting || !userId || !form.title}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-tribe-green text-slate-900 rounded-lg font-semibold text-sm hover:bg-[#92d31f] transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? labels.submitting : labels.submit}
          </button>
        </form>
      )}

      {/* Category filter pills */}
      <div className="flex overflow-x-auto gap-2 pb-1 -mx-4 px-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedCategory === cat.key
                ? 'bg-[#A3E635] text-slate-900'
                : 'bg-stone-200 dark:bg-[#52575D] text-theme-primary hover:bg-stone-300 dark:hover:bg-[#6B7178]'
            }`}
          >
            {language === 'es' ? cat.es : cat.en}
          </button>
        ))}
      </div>

      {/* Posts list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48">
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <BulletinCard key={post.id} post={post} language={language} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 mx-auto text-stone-400 dark:text-gray-500 mb-3" />
          <p className="text-theme-primary font-medium">{labels.noPosts}</p>
          <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{labels.noPostsDesc}</p>
        </div>
      )}
    </div>
  );
}
