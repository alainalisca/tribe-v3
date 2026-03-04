import { SupabaseClient } from '@supabase/supabase-js';
import type { Session } from '@/lib/database.types';

export interface Participant {
  user_id: string | null;
  status: string | null;
  is_guest?: boolean | null;
  guest_name?: string | null;
  user?: { id: string; name: string; avatar_url: string | null } | null;
}

export interface UseSessionActionsParams {
  supabase: SupabaseClient;
  sessionId: string;
  session: Session;
  user: { id: string; email?: string; user_metadata?: { name?: string } } | null;
  language: 'en' | 'es';
  onSessionUpdated: () => Promise<void>;
  onNavigate: (path: string) => void;
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>;
  setSession: React.Dispatch<React.SetStateAction<Session | null>>;
}

export interface ConfirmAction {
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface GuestData {
  name: string;
  phone: string;
  email: string;
}

/** Error messages for join failures, keyed by error code */
export function getJoinErrorMessages(language: 'en' | 'es'): Record<string, string> {
  return {
    session_not_found: language === 'es' ? 'Sesion no encontrada' : 'Session not found',
    session_not_active: language === 'es' ? 'Esta sesion ya no esta activa' : 'This session is no longer active',
    self_join: language === 'es' ? 'No puedes unirte a tu propia sesion!' : 'You cannot join your own session!',
    already_joined: language === 'es' ? 'Ya te uniste a esta sesion!' : 'You already joined this session!',
    capacity_full: language === 'es' ? 'Esta sesion esta llena' : 'This session is full',
    invite_only:
      language === 'es'
        ? 'Sesion privada. Necesitas una invitacion del organizador.'
        : 'This is a private session. You need a direct invitation from the host.',
  };
}
