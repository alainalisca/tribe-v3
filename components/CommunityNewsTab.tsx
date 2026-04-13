'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { fetchCommunityNews, type CommunityNewsArticle, type NewsCategory } from '@/lib/dal/communityNews';
import { SkeletonCard } from '@/components/Skeleton';
import { ExternalLink, Newspaper } from 'lucide-react';

const CATEGORIES: { key: string; en: string; es: string }[] = [
  { key: 'all', en: 'All', es: 'Todos' },
  { key: 'running', en: 'Running', es: 'Running' },
  { key: 'cycling', en: 'Cycling', es: 'Ciclismo' },
  { key: 'fitness', en: 'Fitness', es: 'Fitness' },
  { key: 'events', en: 'Events', es: 'Eventos' },
  { key: 'health', en: 'Health', es: 'Salud' },
];

const getTranslations = (language: 'en' | 'es') => ({
  noNews: language === 'es' ? 'No hay noticias aún' : 'No news yet',
  noNewsDesc:
    language === 'es' ? '¡Vuelve pronto para ver las últimas noticias!' : 'Check back soon for the latest updates!',
  readMore: language === 'es' ? 'Leer más' : 'Read more',
  daysAgo: language === 'es' ? 'hace {n} días' : '{n} days ago',
  hoursAgo: language === 'es' ? 'hace {n} horas' : '{n} hours ago',
  today: language === 'es' ? 'Hoy' : 'Today',
  yesterday: language === 'es' ? 'Ayer' : 'Yesterday',
});

function getRelativeTime(dateStr: string, language: 'en' | 'es'): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    return language === 'es' ? 'Hace un momento' : 'Just now';
  }
  if (diffHours < 24) {
    return language === 'es' ? `hace ${diffHours}h` : `${diffHours}h ago`;
  }
  if (diffDays === 1) {
    return language === 'es' ? 'Ayer' : 'Yesterday';
  }
  if (diffDays < 30) {
    return language === 'es' ? `hace ${diffDays} días` : `${diffDays} days ago`;
  }
  return date.toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const SOURCE_COLORS: Record<string, string> = {
  INDER: 'bg-blue-500/20 text-blue-400',
  Tribe: 'bg-tribe-green-light/20 text-tribe-green',
  Community: 'bg-purple-500/20 text-purple-400',
};

function NewsCard({ article, language }: { article: CommunityNewsArticle; language: 'en' | 'es' }) {
  const title = language === 'es' && article.title_es ? article.title_es : article.title;
  const summary = language === 'es' && article.summary_es ? article.summary_es : article.summary;
  const sourceColor = SOURCE_COLORS[article.source] || 'bg-stone-500/20 text-stone-400';
  const t = getTranslations(language);

  return (
    <a
      href={article.body_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl bg-white dark:bg-tribe-dark border border-stone-200 dark:border-[#52575D] overflow-hidden hover:border-tribe-green/50 transition group"
    >
      {/* Image or gradient placeholder */}
      {article.image_url ? (
        <div className="h-40 w-full overflow-hidden">
          <img
            src={article.image_url}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      ) : (
        <div className="h-24 w-full bg-gradient-to-br from-[#A3E635]/20 via-[#3D4349] to-[#272D34] flex items-center justify-center">
          <Newspaper className="w-8 h-8 text-tribe-green/40" />
        </div>
      )}

      <div className="p-4 space-y-2">
        {/* Source badge + date */}
        <div className="flex items-center justify-between">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sourceColor}`}>{article.source}</span>
          <span className="text-xs text-stone-400 dark:text-gray-500">
            {getRelativeTime(article.published_at, language)}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-theme-primary text-sm leading-snug line-clamp-2">{title}</h3>

        {/* Summary */}
        <p className="text-xs text-stone-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{summary}</p>

        {/* Read more link */}
        <div className="flex items-center gap-1 text-tribe-green text-xs font-medium pt-1">
          <span>{t.readMore}</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </a>
  );
}

export default function CommunityNewsTab() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [articles, setArticles] = useState<CommunityNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    loadNews();
  }, [selectedCategory]);

  async function loadNews() {
    try {
      setLoading(true);
      const result = await fetchCommunityNews(supabase, selectedCategory === 'all' ? undefined : selectedCategory);
      if (result.success) {
        setArticles(result.data || []);
      }
    } catch (error) {
      logError(error, { action: 'loadCommunityNews' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Category filter pills */}
      <div className="flex overflow-x-auto gap-2 pb-1 -mx-4 px-4 scrollbar-hide">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
              selectedCategory === cat.key
                ? 'bg-tribe-green-light text-slate-900'
                : 'bg-stone-200 dark:bg-tribe-mid text-theme-primary hover:bg-stone-300 dark:hover:bg-tribe-card'
            }`}
          >
            {language === 'es' ? cat.es : cat.en}
          </button>
        ))}
      </div>

      {/* News list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48">
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : articles.length > 0 ? (
        <div className="space-y-4">
          {articles.map((article) => (
            <NewsCard key={article.id} article={article} language={language} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Newspaper className="w-12 h-12 mx-auto text-stone-400 dark:text-gray-500 mb-3" />
          <p className="text-theme-primary font-medium">{t.noNews}</p>
          <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.noNewsDesc}</p>
        </div>
      )}
    </div>
  );
}
