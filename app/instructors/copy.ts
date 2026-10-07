/**
 * Copy for /instructors (Discover). Split out of InstructorsPageClient to keep
 * that file under the 300-line limit; inline ternaries kept as-is so the
 * i18n guards that scan the `language === 'es'` shape still see every string.
 */
export const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Descubre Instructores' : 'Discover Instructors',
  search: language === 'es' ? 'Buscar por nombre o especialidades...' : 'Search by name or specialties...',
  sortMostSessions: language === 'es' ? 'Más Sesiones' : 'Most Sessions',
  sortHighestRated: language === 'es' ? 'Mejor Calificados' : 'Highest Rated',
  sortNewest: language === 'es' ? 'Más Nuevo' : 'Newest',
  sortNearest: language === 'es' ? 'Más Cerca' : 'Nearest',
  sort: language === 'es' ? 'Ordenar' : 'Sort',
  // Three states, three messages. They used to share one, and the shared one
  // said the viewer's search was the problem.
  loadFailed: language === 'es' ? 'No pudimos cargar los instructores' : "We couldn't load instructors",
  loadFailedDesc:
    language === 'es'
      ? 'Es un problema de nuestro lado, no de tu búsqueda.'
      : 'This is a problem on our side, not with your search.',
  retry: language === 'es' ? 'Intentar de nuevo' : 'Try again',
  retrying: language === 'es' ? 'Intentando...' : 'Trying...',
  noneYet: language === 'es' ? 'Aún no hay instructores' : 'No instructors yet',
  noneYetDesc:
    language === 'es'
      ? 'Los instructores aparecen aquí cuando completan su perfil.'
      : 'Instructors appear here once they complete their profile.',
  noInstructorsFound: language === 'es' ? 'No se encontraron instructores' : 'No instructors found',
  noInstructorsDesc:
    language === 'es'
      ? 'Intenta ajustar tu búsqueda o vuelve más tarde'
      : 'Try adjusting your search or check back later',
  mapView: language === 'es' ? 'Mapa' : 'Map',
  listView: language === 'es' ? 'Lista' : 'List',
  nearMe: language === 'es' ? 'Cerca de mí' : 'Near Me',
  gettingLocation: language === 'es' ? 'Obteniendo ubicación...' : 'Getting location...',
  clearSearch: language === 'es' ? 'Limpiar Búsqueda' : 'Clear Search',
  all: language === 'es' ? 'Todos' : 'All',
});
