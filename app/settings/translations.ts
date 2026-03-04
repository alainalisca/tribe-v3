export function getSettingsTranslations(language: 'en' | 'es') {
  return {
    settings: language === 'es' ? 'Configuración' : 'Settings',
    language: language === 'es' ? 'Idioma' : 'Language',
    english: language === 'es' ? 'Inglés' : 'English',
    spanish: language === 'es' ? 'Español' : 'Spanish',
    account: language === 'es' ? 'Cuenta' : 'Account',
    signOut: language === 'es' ? 'Cerrar Sesión' : 'Sign Out',
    deleteAccount: language === 'es' ? 'Eliminar Cuenta' : 'Delete Account',
    deleteAccountConfirm:
      language === 'es'
        ? '¿Estás seguro? Esto eliminará permanentemente tu cuenta y todos los datos. Escribe ELIMINAR para confirmar.'
        : 'Are you sure? This will permanently delete your account and all data. Type DELETE to confirm.',
    legal: 'Legal',
    terms: language === 'es' ? 'Términos de Servicio' : 'Terms of Service',
    privacy: language === 'es' ? 'Política de Privacidad' : 'Privacy Policy',
    safety: language === 'es' ? 'Guías de Seguridad' : 'Safety Guidelines',
    admin: language === 'es' ? 'Administrador' : 'Admin',
    adminPanel: language === 'es' ? 'Panel de Administrador' : 'Admin Panel',
    help: language === 'es' ? 'Ayuda y Comentarios' : 'Help & Feedback',
    feedback: language === 'es' ? 'Enviar Comentarios' : 'Send Feedback',
    bugReport: language === 'es' ? 'Reportar un Error' : 'Report a Bug',
    pushNotifications: language === 'es' ? 'Notificaciones Push' : 'Push Notifications',
    notificationsEnabledLabel: language === 'es' ? '✓ Notificaciones Activadas' : '✓ Notifications Enabled',
    enableNotifications: language === 'es' ? 'Activar Notificaciones' : 'Enable Notifications',
    sessionRemindersOn: language === 'es' ? '✓ Recordatorios de Sesión' : '✓ Session Reminders',
    sessionRemindersOff: language === 'es' ? 'Recordatorios de Sesión' : 'Session Reminders',
    sessionRemindersDesc:
      language === 'es' ? '1 hora y 15 min antes de tus sesiones' : '1 hour & 15 min before your sessions',
    deleteModalTitle: language === 'es' ? 'Eliminar cuenta' : 'Delete Account',
    deleteModalDesc:
      language === 'es'
        ? 'Esto eliminará permanentemente tu cuenta y todos los datos. Escribe ELIMINAR para confirmar.'
        : 'This will permanently delete your account and all data. Type DELETE to confirm.',
    deleteConfirmWord: language === 'es' ? 'ELIMINAR' : 'DELETE',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    delete: language === 'es' ? 'Eliminar' : 'Delete',
  };
}

export type SettingsTranslations = ReturnType<typeof getSettingsTranslations>;
