export type Language = 'en' | 'es';
export type TranslationKey = keyof typeof translations.en;

export const translations = {
  en: {
    home: 'Home',
    mySessions: 'My Sessions',
    create: 'Create',
    myTribe: 'My Tribe',
    profile: 'Profile',
    settings: 'Settings',
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    searchPlaceholder: 'Search by sport, location...',
    allFilters: 'All - Filters',
    sessionDetails: 'Session Details',
    sessionCreated: 'Session created successfully!',
    createSession: 'Create Session',
    joinSession: 'Join',
    leaveSession: 'Leave Session',
    cancelSession: 'Cancel Session',
    viewDetails: 'View Details',
    sessionFull: 'Session Full',
    participants: 'Participants',
    joinedSuccessfully: "Joined successfully!",
    alreadyJoined: "You've already joined this session",
    sessionFullMsg: "This session is full",
    past: "Past",
    noParticipants: 'No participants yet. Be the first to join!',
    sport: 'Sport',
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    location: 'Location',
    maxParticipants: 'Max Participants',
    description: 'Description',
    optional: 'Optional',
    minutes: 'minutes',
  },
  es: {
    home: 'Inicio',
    mySessions: 'Mis Sesiones',
    create: 'Crear',
    myTribe: 'Mi Tribu',
    profile: 'Perfil',
    settings: 'Configuración',
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    edit: 'Editar',
    searchPlaceholder: 'Buscar por deporte, ubicación...',
    allFilters: 'Todos - Filtros',
    sessionDetails: 'Detalles de Sesión',
    sessionCreated: '¡Sesión creada exitosamente!',
    createSession: 'Crear Sesión',
    createSession: 'Create Session',
    sessionCreated: 'Session created successfully!',
    createSession: 'Create Session',
    joinSession: 'Unirse',
    leaveSession: 'Salir',
    cancelSession: 'Cancelar Sesión',
    viewDetails: 'Ver Detalles',
    sessionFull: 'Lleno',
    participants: 'Participantes',
    noParticipants: '¡Sin participantes aún! Sé el primero.',
    sport: 'Deporte',
    date: 'Fecha',
    time: 'Hora',
    duration: 'Duración',
    location: 'Ubicación',
    maxParticipants: 'Máximo de Participantes',
    description: 'Descripción',
    optional: 'Opcional',
    minutes: 'minutos',
  },
    joinedSuccessfully: "¡Te uniste exitosamente!",
    alreadyJoined: "Ya te uniste a esta sesión",
    sessionFullMsg: "Esta sesión está llena",
    past: "Pasado",
};


// Add missing My Sessions translations
translations.en['No sessions'] = 'No sessions';
translations.en['Create Session'] = 'Create Session';

translations.es['No sessions'] = 'Sin sesiones';
translations.es['Create Session'] = 'Crear Sesión';

// Bottom nav translations


// Matches page


// Edit Profile



// Add all missing translations


// Add missing translations





export const sportTranslations: { [key: string]: { en: string; es: string } } = {
  'Running': { en: 'Running', es: 'Correr' },
  'Hiking': { en: 'Hiking', es: 'Senderismo' },
  'Cycling': { en: 'Cycling', es: 'Ciclismo' },
  'Swimming': { en: 'Swimming', es: 'Natación' },
  'CrossFit': { en: 'CrossFit', es: 'CrossFit' },
  'Weightlifting': { en: 'Weightlifting', es: 'Pesas' },
  'Calisthenics': { en: 'Calisthenics', es: 'Calistenia' },
  'Boxing': { en: 'Boxing', es: 'Boxeo' },
  'Muay Thai': { en: 'Muay Thai', es: 'Muay Thai' },
  'Kickboxing': { en: 'Kickboxing', es: 'Kickboxing' },
  'Jiu-Jitsu': { en: 'Jiu-Jitsu', es: 'Jiu-Jitsu' },
  'Soccer': { en: 'Soccer', es: 'Fútbol' },
  'Basketball': { en: 'Basketball', es: 'Baloncesto' },
  'Volleyball': { en: 'Volleyball', es: 'Voleibol' },
  'Yoga': { en: 'Yoga', es: 'Yoga' },
  'Pilates': { en: 'Pilates', es: 'Pilates' },
  'Dance': { en: 'Dance', es: 'Baile' },
  'Tennis': { en: 'Tennis', es: 'Tenis' },
  'Padel': { en: 'Padel', es: 'Pádel' },
  'Skateboarding': { en: 'Skateboarding', es: 'Skate' },
  'BMX': { en: 'BMX', es: 'BMX' },
  'Other': { en: 'Other', es: 'Otro' },
};

// Matches page translations


// Matches page translations









// Additional translations for create page








