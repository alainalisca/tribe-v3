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

/**
 * Error messages for join failures, keyed by error code. Structured as
 * per-language records (not per-entry ternaries) per UI-I01/UI-I02.
 */
const JOIN_ERROR_MESSAGES: Record<'en' | 'es', Record<string, string>> = {
  en: {
    session_not_found: 'Session not found',
    session_not_active: 'This session is no longer active',
    self_join: 'You cannot join your own session!',
    already_joined: 'You already joined this session!',
    capacity_full: 'This session is full',
    invite_only: 'This is a private session. You need a direct invitation from the host.',
    // T-INV1: invite link acceptance failures.
    invite_invalid: 'This invitation is not valid. Ask the host for a new link.',
    invite_expired: 'This invitation has expired. Ask the host for a new link.',
  },
  es: {
    session_not_found: 'Sesion no encontrada',
    session_not_active: 'Esta sesion ya no esta activa',
    self_join: 'No puedes unirte a tu propia sesion!',
    already_joined: 'Ya te uniste a esta sesion!',
    capacity_full: 'Esta sesion esta llena',
    invite_only: 'Sesion privada. Necesitas una invitacion del organizador.',
    // T-INV1: invite link acceptance failures.
    invite_invalid: 'Esta invitacion no es valida. Pide al organizador un nuevo enlace.',
    invite_expired: 'Esta invitacion ya expiro. Pide al organizador un nuevo enlace.',
  },
};

export function getJoinErrorMessages(language: 'en' | 'es'): Record<string, string> {
  return JOIN_ERROR_MESSAGES[language];
}
