export interface Story {
  id: string;
  media_url: string;
  media_type: 'image' | 'video';
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  sessionId: string;
  sport: string;
}

export interface StoryGroup {
  sessionId: string;
  sport: string;
  stories: Story[];
}

export function timeAgo(dateStr: string | null, lang: string): string {
  if (!dateStr) return '';
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return '';
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);

    if (mins < 1) return lang === 'es' ? 'ahora' : 'just now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return '';
  }
}
