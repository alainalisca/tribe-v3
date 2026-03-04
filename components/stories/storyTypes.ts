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
}

export interface StoryGroup {
  sessionId: string;
  sport: string;
  stories: Story[];
}

/** Subset of session fields used in the story upload session picker */
export interface ActiveSession {
  id: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
}

export function timeAgo(dateStr: string, lang: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);

  if (mins < 1) return lang === 'es' ? 'ahora' : 'just now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
