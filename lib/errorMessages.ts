export function getErrorMessage(error: unknown, context: string, language: 'en' | 'es' = 'en'): string {
  const err = error as Record<string, unknown> | null;
  const errorCode = String(err?.code || err?.message || '');
  
  // Common Supabase/Postgres errors
  const errorMap: Record<string, { en: string; es: string }> = {
    // Auth errors
    'invalid_credentials': {
      en: 'Invalid email or password. Please try again.',
      es: 'Email o contraseña inválidos. Inténtalo de nuevo.'
    },
    'user_already_exists': {
      en: 'An account with this email already exists.',
      es: 'Ya existe una cuenta con este email.'
    },
    'email_not_confirmed': {
      en: 'Please verify your email address first.',
      es: 'Por favor verifica tu dirección de email primero.'
    },
    
    // Database errors
    '23505': { // Unique constraint violation
      en: 'You have already joined this session.',
      es: 'Ya te has unido a esta sesión.'
    },
    '23503': { // Foreign key violation
      en: 'This item no longer exists.',
      es: 'Este elemento ya no existe.'
    },
    
    // Network errors
    'NETWORK_ERROR': {
      en: 'Connection lost. Please check your internet.',
      es: 'Conexión perdida. Verifica tu internet.'
    },
    'TIMEOUT': {
      en: 'Request timed out. Please try again.',
      es: 'Tiempo de espera agotado. Inténtalo de nuevo.'
    },
  };

  // Context-specific fallbacks
  const contextMessages: Record<string, { en: string; es: string }> = {
    join_session: {
      en: 'Could not join session. Please try again.',
      es: 'No se pudo unir a la sesión. Inténtalo de nuevo.'
    },
    create_session: {
      en: 'Could not create session. Please check your details.',
      es: 'No se pudo crear la sesión. Verifica los detalles.'
    },
    upload_photo: {
      en: 'Could not upload photo. File may be too large.',
      es: 'No se pudo subir la foto. El archivo puede ser muy grande.'
    },
    update_profile: {
      en: 'Could not update profile. Please try again.',
      es: 'No se pudo actualizar el perfil. Inténtalo de nuevo.'
    },
    delete_session: {
      en: 'Could not delete session. Please try again.',
      es: 'No se pudo eliminar la sesión. Inténtalo de nuevo.'
    },
    send_message: {
      en: 'Could not send message. Please try again.',
      es: 'No se pudo enviar el mensaje. Inténtalo de nuevo.'
    },
    update_session: {
      en: 'Could not update session. Please try again.',
      es: 'No se pudo actualizar la sesión. Inténtalo de nuevo.'
    },
    submit_feedback: {
      en: 'Could not submit feedback. Please try again.',
      es: 'No se pudo enviar el comentario. Inténtalo de nuevo.'
    },
    submit_review: {
      en: 'Could not submit review. Please try again.',
      es: 'No se pudo enviar la reseña. Inténtalo de nuevo.'
    },
    accept_invite: {
      en: 'Could not accept invitation. Please try again.',
      es: 'No se pudo aceptar la invitación. Inténtalo de nuevo.'
    },
    handle_request: {
      en: 'Could not process request. Please try again.',
      es: 'No se pudo procesar la solicitud. Inténtalo de nuevo.'
    },
    update_settings: {
      en: 'Could not save settings. Please try again.',
      es: 'No se pudo guardar la configuración. Inténtalo de nuevo.'
    },
    admin_action: {
      en: 'Action failed. Please try again.',
      es: 'Acción fallida. Inténtalo de nuevo.'
    },
    accept_waiver: {
      en: 'Could not accept waiver. Please try again.',
      es: 'No se pudo aceptar la exención. Inténtalo de nuevo.'
    },
  };

  // Check if we have a specific error mapping
  for (const [key, message] of Object.entries(errorMap)) {
    if (errorCode.includes(key)) {
      return message[language];
    }
  }

  // Use context-specific fallback
  if (contextMessages[context]) {
    return contextMessages[context][language];
  }

  // Generic fallback
  return language === 'es' 
    ? 'Algo salió mal. Por favor inténtalo de nuevo.'
    : 'Something went wrong. Please try again.';
}
