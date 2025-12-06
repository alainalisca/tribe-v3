export function getErrorMessage(error: any, context: string, language: 'en' | 'es' = 'en'): string {
  const errorCode = error?.code || error?.message || '';
  
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
