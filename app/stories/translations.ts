export function getStoriesTranslations(language: 'en' | 'es') {
  return language === 'es'
    ? {
        stories: 'Historias',
        noStories: 'No hay historias a\u00fan',
        noStoriesDesc:
          'Las historias de sesiones aparecer\u00e1n aqu\u00ed. \u00a1S\u00e9 el primero en compartir tu entrenamiento!',
      }
    : {
        stories: 'Stories',
        noStories: 'No stories yet',
        noStoriesDesc: 'Session stories will appear here. Be the first to share your training!',
      };
}

export type StoriesTranslations = ReturnType<typeof getStoriesTranslations>;
