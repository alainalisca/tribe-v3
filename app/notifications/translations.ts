export function getNotificationTranslations(language: 'en' | 'es') {
  return {
    activity: language === 'es' ? 'Actividad' : 'Activity',
    notifications: language === 'es' ? 'Notificaciones' : 'Notifications',
    markAllAsRead: language === 'es' ? 'Marcar todo como leído' : 'Mark all as read',
    noNotifications: language === 'es' ? 'No hay notificaciones aún' : 'No notifications yet',
    follow: language === 'es' ? 'Seguidor' : 'Follow',
    like: language === 'es' ? 'Like' : 'Like',
    comment: language === 'es' ? 'Comentario' : 'Comment',
    review: language === 'es' ? 'Reseña' : 'Review',
    sessionJoin: language === 'es' ? 'Se unió a sesión' : 'Session Join',
    communityInvite: language === 'es' ? 'Invitación de comunidad' : 'Community Invite',
    achievement: language === 'es' ? 'Logro' : 'Achievement',
    referralComplete: language === 'es' ? 'Referencia completada' : 'Referral Complete',
    dm: language === 'es' ? 'Mensaje directo' : 'Direct Message',
    challengeComplete: language === 'es' ? 'Desafío completado' : 'Challenge Complete',
    communityPost: language === 'es' ? 'Publicación de comunidad' : 'Community Post',
    somethingWentWrong: language === 'es' ? 'Algo salió mal' : 'Something went wrong',
    tryAgain: language === 'es' ? 'Intentar de nuevo' : 'Try Again',
  };
}

export type NotificationTranslations = ReturnType<typeof getNotificationTranslations>;
