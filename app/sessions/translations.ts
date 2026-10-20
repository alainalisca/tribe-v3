export function getSessionsTranslations(language: 'en' | 'es') {
  return language === 'es'
    ? {
        mySessions: 'Mis Sesiones',
        upcoming: 'Pr\u00f3ximas',
        past: 'Historial',
        hosting: 'Organizando',
        joined: 'Me uní',
        noUpcoming: 'No tienes sesiones pr\u00f3ximas',
        noPast: 'No tienes sesiones pasadas',
        browseHome: 'Explora sesiones para unirte',
        createSession: 'Crear Sesi\u00f3n',
        browseSessions: 'Ver Sesiones',
        spots: 'cupos',
        ended: 'Terminada',
        cancelled: 'Cancelada',
        youHosted: 'Organizaste',
        youJoined: 'Te uniste',
        createCta: 'Crear sesión',
        requests: 'Solicitudes',
        requestsHint: 'Atletas esperando tu respuesta',
        viewMyTraining: 'Ver mi entrenamiento',
      }
    : {
        mySessions: 'My Sessions',
        upcoming: 'Upcoming',
        past: 'History',
        hosting: 'Hosting',
        joined: 'Joined',
        noUpcoming: 'No upcoming sessions',
        noPast: 'No past sessions',
        browseHome: 'Browse sessions to join',
        createSession: 'Create Session',
        browseSessions: 'Browse Sessions',
        spots: 'spots',
        ended: 'Ended',
        cancelled: 'Cancelled',
        youHosted: 'You hosted',
        youJoined: 'You joined',
        createCta: 'Create session',
        requests: 'Requests',
        requestsHint: 'Athletes waiting for your answer',
        viewMyTraining: 'View my training',
      };
}

export type SessionsTranslations = ReturnType<typeof getSessionsTranslations>;
