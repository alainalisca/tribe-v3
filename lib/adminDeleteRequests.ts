/**
 * Client-side calls to the admin delete routes, plus the sentence an admin
 * sees for each refusal. Kept out of the components so the wording for every
 * error code lives in one place and can be tested without rendering.
 */
import { logError } from '@/lib/logger';

export type DeleteRequestResult = { ok: true; deletedIds: string[] } | { ok: false; error: string };

async function post(url: string, body?: unknown): Promise<{ status: number; payload: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, payload };
}

export async function requestAdminSessionDelete(
  sessionId: string,
  scope: 'single' | 'series'
): Promise<DeleteRequestResult> {
  try {
    const { status, payload } = await post(`/api/admin/sessions/${sessionId}/delete`, { scope });
    if (status >= 200 && status < 300 && payload.success === true) {
      const ids = Array.isArray(payload.deletedIds) ? (payload.deletedIds as string[]) : [sessionId];
      return { ok: true, deletedIds: ids };
    }
    return { ok: false, error: typeof payload.error === 'string' ? payload.error : `http_${status}` };
  } catch (error) {
    logError(error, { action: 'requestAdminSessionDelete', sessionId });
    return { ok: false, error: 'network' };
  }
}

export async function requestAdminUserDelete(userId: string): Promise<DeleteRequestResult> {
  try {
    const { status, payload } = await post(`/api/admin/users/${userId}/delete`);
    if (status >= 200 && status < 300 && payload.success === true) return { ok: true, deletedIds: [userId] };
    return { ok: false, error: typeof payload.error === 'string' ? payload.error : `http_${status}` };
  } catch (error) {
    logError(error, { action: 'requestAdminUserDelete', userId });
    return { ok: false, error: 'network' };
  }
}

const SESSION_ERRORS: Record<string, { en: string; es: string }> = {
  has_payments: {
    en: 'This session has payment records, so it cannot be deleted. Cancel it instead, which refunds people.',
    es: 'Esta sesión tiene pagos registrados y no se puede eliminar. Cancélala en su lugar, así se reembolsa.',
  },
  series_requires_scope: {
    en: 'This session became part of a repeating series. Reload and try again.',
    es: 'Esta sesión ahora es parte de una serie. Recarga e inténtalo de nuevo.',
  },
  linked_records: {
    en: 'Other records still point at this session, so nothing was deleted.',
    es: 'Otros registros todavía dependen de esta sesión, así que no se eliminó nada.',
  },
  session_not_found: {
    en: 'That session no longer exists.',
    es: 'Esa sesión ya no existe.',
  },
  forbidden: {
    en: 'Your account is not allowed to do this.',
    es: 'Tu cuenta no tiene permiso para hacer esto.',
  },
};

const USER_ERRORS: Record<string, { en: string; es: string }> = {
  cannot_delete_self: {
    en: 'You cannot delete your own account from the admin panel.',
    es: 'No puedes eliminar tu propia cuenta desde el panel de administración.',
  },
  target_is_admin: {
    en: 'Admin accounts cannot be deleted here. Remove admin access first.',
    es: 'Las cuentas de administrador no se pueden eliminar aquí. Quita primero el acceso de administrador.',
  },
  user_not_found: {
    en: 'That account no longer exists.',
    es: 'Esa cuenta ya no existe.',
  },
  forbidden: SESSION_ERRORS.forbidden,
};

// A dropped connection is the one case where we do not know the outcome, so
// it must not claim "nothing was deleted" like the fallback does.
const NETWORK = {
  en: 'Could not confirm the delete. Reload the list to check.',
  es: 'No pudimos confirmar la eliminación. Recarga la lista para verificar.',
};
SESSION_ERRORS.network = NETWORK;
USER_ERRORS.network = NETWORK;

const FALLBACK = {
  en: 'Something went wrong, nothing was deleted. Try again.',
  es: 'Algo salió mal y no se eliminó nada. Inténtalo de nuevo.',
};

export function deleteSessionErrorMessage(code: string, isEs: boolean): string {
  const m = SESSION_ERRORS[code] ?? FALLBACK;
  return isEs ? m.es : m.en;
}

export function deleteUserErrorMessage(code: string, isEs: boolean): string {
  const m = USER_ERRORS[code] ?? FALLBACK;
  return isEs ? m.es : m.en;
}
