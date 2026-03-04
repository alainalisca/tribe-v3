export function getEditProfileTranslations(language: 'en' | 'es') {
  return {
    editProfile: language === 'es' ? 'Editar Perfil' : 'Edit Profile',
    save: language === 'es' ? 'Guardar' : 'Save',
    saving: language === 'es' ? 'Guardando...' : 'Saving...',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    name: language === 'es' ? 'Nombre' : 'Name',
    namePlaceholder: language === 'es' ? 'Tu nombre' : 'Your name',
    username: language === 'es' ? 'Nombre de usuario' : 'Username',
    location: language === 'es' ? 'Ubicación' : 'Location',
    locationPlaceholder: language === 'es' ? 'Ciudad, Estado/País' : 'City, State/Country',
    bio: language === 'es' ? 'Biografía' : 'Bio',
    bioPlaceholder: language === 'es' ? 'Cuéntanos sobre ti...' : 'Tell us about yourself...',
    photos: language === 'es' ? 'Fotos' : 'Photos',
    addPhoto: language === 'es' ? 'Agregar Foto' : 'Add Photo',
    maxPhotos: language === 'es' ? 'Máximo 6 fotos permitidas' : 'Maximum 6 photos allowed',
    sports: language === 'es' ? 'Deportes y Actividades' : 'Sports & Activities',
    saveProfile: language === 'es' ? 'Guardar Perfil' : 'Save Profile',
    profileUpdated: language === 'es' ? '¡Perfil actualizado con éxito!' : 'Profile updated successfully!',
    emergencyContact:
      language === 'es'
        ? 'Contacto de Emergencia (Opcional pero Recomendado)'
        : 'Emergency Contact (Optional but Recommended)',
    emergencyDesc:
      language === 'es'
        ? 'Información de contacto de emergencia en caso de accidente durante una sesión'
        : 'Emergency contact information in case of an incident during a session',
    contactName: language === 'es' ? 'Nombre de Contacto' : 'Contact Name',
    contactPhone: language === 'es' ? 'Teléfono de Contacto' : 'Contact Phone',
    socialMedia: language === 'es' ? 'Redes Sociales (Recomendado)' : 'Social Media (Recommended)',
    socialDesc:
      language === 'es'
        ? 'Ayuda a otros a verificar que eres una persona real. Los compañeros de entrenamiento pueden revisar tu perfil antes de unirse.'
        : 'Help others verify you are a real person. Training partners can check your profile before joining.',
    instagramLabel: language === 'es' ? '(nombre de usuario)' : '(username)',
    facebookLabel: language === 'es' ? '(URL del perfil)' : '(profile URL)',
    welcomeBanner:
      language === 'es'
        ? '¡Bienvenido a Tribe! Completa tu perfil para encontrar compañeros de entrenamiento cerca de ti.'
        : 'Welcome to Tribe! Complete your profile to find training partners near you.',
    contactNamePlaceholder: language === 'es' ? 'ej. Juan Pérez' : 'e.g. John Smith',
    contactPhonePlaceholder: language === 'es' ? 'ej. +57 300 123 4567' : 'e.g. +1 (555) 123-4567',
  };
}

export type EditProfileTranslations = ReturnType<typeof getEditProfileTranslations>;
