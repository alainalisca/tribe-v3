import type { StoryGroup } from './storyTypes';

// --- Seen stories (localStorage) ---

export function getSeenStories(): Set<string> {
  try {
    const raw = localStorage.getItem('tribe_seen_stories');
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function markStoriesSeen(ids: string[]) {
  const seen = getSeenStories();
  ids.forEach((id) => seen.add(id));
  // Keep only last 500 to avoid localStorage bloat
  const arr = [...seen].slice(-500);
  localStorage.setItem('tribe_seen_stories', JSON.stringify(arr));
}

// --- Cache (sessionStorage) ---

const CACHE_KEY = 'tribe_stories_cache';
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export function getCachedStories(): StoryGroup[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as StoryGroup[];
  } catch {
    return null;
  }
}

export function setCachedStories(data: StoryGroup[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // sessionStorage write is best-effort; cache miss is harmless
  }
}

export function clearStoriesCache() {
  sessionStorage.removeItem(CACHE_KEY);
}

// --- UI helpers ---

export function getSportEmoji(sport: string): string {
  const map: Record<string, string> = {
    Running: '\u{1F3C3}',
    Cycling: '\u{1F6B4}',
    Swimming: '\u{1F3CA}',
    CrossFit: '\u{1F3CB}\uFE0F',
    Boxing: '\u{1F94A}',
    'Jiu-Jitsu': '\u{1F94B}',
    Soccer: '\u26BD',
    Basketball: '\u{1F3C0}',
    Volleyball: '\u{1F3D0}',
    Yoga: '\u{1F9D8}',
    Tennis: '\u{1F3BE}',
    Hiking: '\u{1F97E}',
    Dance: '\u{1F483}',
    Padel: '\u{1F3BE}',
    Skateboarding: '\u{1F6F9}',
    BMX: '\u{1F6B2}',
    Surfing: '\u{1F3C4}',
    'Rock Climbing': '\u{1F9D7}',
    Golf: '\u26F3',
    Rugby: '\u{1F3C9}',
    Calisthenics: '\u{1F4AA}',
    'Martial Arts': '\u{1F94B}',
  };
  return map[sport] || '\u{1F4AA}';
}

export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}
