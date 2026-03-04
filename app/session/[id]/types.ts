import type { Database } from '@/lib/database.types';

export type RecapPhotoRow = Database['public']['Tables']['session_recap_photos']['Row'];
export type RecapPhotoWithUser = RecapPhotoRow & {
  user: { id: string; name: string | null; avatar_url: string | null } | undefined;
};

export type SessionStoryJoined = {
  id: string;
  session_id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string | null;
  user: { name: string | null; avatar_url: string | null } | null;
};
