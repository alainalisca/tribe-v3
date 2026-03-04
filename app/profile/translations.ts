export function getProfileTranslations(language: 'en' | 'es') {
  return {
    created: language === 'es' ? 'Creadas' : 'Created',
    joined: language === 'es' ? 'Unidas' : 'Joined',
    total: 'Total',
    noBio:
      language === 'es'
        ? 'Sin bio aún. Haz clic en Editar Perfil para agregar una.'
        : 'No bio yet. Click Edit Profile to add one.',
    verifiedSocial: language === 'es' ? 'Redes Sociales Verificadas' : 'Verified Social Media',
    photos: language === 'es' ? 'Fotos' : 'Photos',
    showLess: language === 'es' ? 'Mostrar Menos' : 'Show Less',
    showMore: (count: number) => (language === 'es' ? `Mostrar ${count} Más` : `Show ${count} More`),
    editProfile: language === 'es' ? 'Editar Perfil' : 'Edit Profile',
    profileComplete: (pct: number) => (language === 'es' ? `Perfil: ${pct}% completo` : `Profile: ${pct}% complete`),
  };
}

export type ProfileTranslations = ReturnType<typeof getProfileTranslations>;
