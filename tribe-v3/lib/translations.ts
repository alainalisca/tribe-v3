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
  },
    joinedSuccessfully: "¡Te uniste exitosamente!",
    alreadyJoined: "Ya te uniste a esta sesión",
    sessionFullMsg: "Esta sesión está llena",
    past: "Pasado",
};


// Add missing My Sessions translations
translations.en.mySessions = 'My Sessions';
translations.en.Hosting = 'Hosting';
translations.en.Joined = 'Joined';
translations.en['No sessions'] = 'No sessions';
translations.en.startHosting = 'Start hosting sessions to see them here';
translations.en['Create Session'] = 'Create Session';

translations.es.mySessions = 'Mis Sesiones';
translations.es.Hosting = 'Organizando';
translations.es.Joined = 'Unidos';
translations.es['No sessions'] = 'Sin sesiones';
translations.es.startHosting = 'Comienza a organizar para verlas aquí';
translations.es['Create Session'] = 'Crear Sesión';

// Bottom nav translations
translations.en.home = 'Home';
translations.en.mySessions = 'My Sessions';
translations.en.create = 'Create';
translations.en.myTribe = 'My Tribe';
translations.en.profile = 'Profile';

translations.es.home = 'Inicio';
translations.es.mySessions = 'Mis Sesiones';
translations.es.create = 'Crear';
translations.es.myTribe = 'Mi Tribu';
translations.es.profile = 'Perfil';

// Matches page
translations.en.matches = 'Matches';
translations.en.joinRequests = 'Join Requests';
translations.en.myTribe = 'My Tribe';

translations.es.matches = 'Matches';
translations.es.joinRequests = 'Solicitudes';
translations.es.myTribe = 'Mi Tribu';

// Edit Profile
translations.en.editProfile = 'Edit Profile';
translations.en.name = 'Name';
translations.en.username = 'Username';
translations.en.location = 'Location';
translations.en.bio = 'Bio';
translations.en.photos = 'Photos';
translations.en.sportsActivities = 'Sports & Activities';
translations.en.saveProfile = 'Save Profile';

translations.es.editProfile = 'Editar Perfil';
translations.es.name = 'Nombre';
translations.es.username = 'Usuario';
translations.es.location = 'Ubicación';
translations.es.bio = 'Biografía';
translations.es.photos = 'Fotos';
translations.es.sportsActivities = 'Deportes y Actividades';
translations.es.saveProfile = 'Guardar Perfil';

translations.en.past = 'Past';
translations.es.past = 'Pasado';

// Add all missing translations
translations.en.allFilters = 'all - filters';
translations.en.sessionsCount = 'sessions';
translations.en.past = 'Past';
translations.en.viewDetails = 'View Details';
translations.en.join = 'Join';
translations.en.editProfile = 'Edit Profile';
translations.en.save = 'Save';
translations.en.saveProfile = 'Save Profile';
translations.en.name = 'Name';
translations.en.username = 'Username';
translations.en.location = 'Location';
translations.en.bio = 'Bio';
translations.en.photos = 'Photos';
translations.en.sportsActivities = 'Sports & Activities';

translations.es.allFilters = 'todos - filtros';
translations.es.sessionsCount = 'sesiones';
translations.es.past = 'Pasado';
translations.es.viewDetails = 'Ver Detalles';
translations.es.join = 'Unirse';
translations.es.editProfile = 'Editar Perfil';
translations.es.save = 'Guardar';
translations.es.saveProfile = 'Guardar Perfil';
translations.es.name = 'Nombre';
translations.es.username = 'Usuario';
translations.es.location = 'Ubicación';
translations.es.bio = 'Biografía';
translations.es.photos = 'Fotos';
translations.es.sportsActivities = 'Deportes y Actividades';
translations.en.hostedBy = 'Hosted by';
translations.es.hostedBy = 'Organizado por';

// Add missing translations
translations.en.hostedBy = 'Hosted by';
translations.en.viewDetails = 'View Details';
translations.en.join = 'Join';
translations.en.full = 'Full';
translations.en.past = 'Past';

translations.es.hostedBy = 'Organizado por';
translations.es.viewDetails = 'Ver Detalles';
translations.es.join = 'Unirse';
translations.es.full = 'Lleno';
translations.es.past = 'Pasado';

translations.en.allFilters = 'all - filters';
translations.es.allFilters = 'todos - filtros';

translations.en.sportsAndActivities = 'Sports & Activities';
translations.es.sportsAndActivities = 'Deportes y Actividades';

translations.en.noSessionsFound = 'No sessions found';
translations.en.tryAdjustingFilters = 'Try adjusting your filters';
translations.en.clearFilters = 'Clear Filters';

translations.es.noSessionsFound = 'No se encontraron sesiones';
translations.es.tryAdjustingFilters = 'Intenta ajustar tus filtros';
translations.es.clearFilters = 'Borrar Filtros';
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
translations.en.matches = 'Matches';
translations.en.joinRequests = 'Join Requests';
translations.en.myTribe = 'My Tribe';
translations.en.newJoinRequest = 'New Join Request';
translations.en.userWantsToJoin = 'User wants to join your session';
translations.en.noJoinRequests = 'No join requests yet';
translations.en.noSessions = 'No sessions yet';

translations.es.matches = 'Coincidencias';
translations.es.joinRequests = 'Solicitudes';
translations.es.myTribe = 'Mi Tribu';
translations.es.newJoinRequest = 'Nueva Solicitud';
translations.es.userWantsToJoin = 'Usuario quiere unirse a tu sesión';
translations.es.noJoinRequests = 'Sin solicitudes aún';
translations.es.noSessions = 'Sin sesiones aún';

// Matches page translations
translations.en.matches = 'Matches';
translations.en.joinRequests = 'Join Requests';
translations.en.myTribe = 'My Tribe';
translations.en.newJoinRequest = 'New Join Request';
translations.en.userWantsToJoin = 'User wants to join your session';
translations.en.noJoinRequests = 'No join requests yet';
translations.en.noSessions = 'No sessions yet';

translations.es.matches = 'Coincidencias';
translations.es.joinRequests = 'Solicitudes';
translations.es.myTribe = 'Mi Tribu';
translations.es.newJoinRequest = 'Nueva Solicitud';
translations.es.userWantsToJoin = 'Usuario quiere unirse a tu sesión';
translations.es.noJoinRequests = 'Sin solicitudes aún';
translations.es.noSessions = 'Sin sesiones aún';

translations.en.matches = 'Matches';
translations.en.joinRequests = 'Join Requests';
translations.en.myTribe = 'My Tribe';
translations.en.newJoinRequest = 'New Join Request';
translations.en.userWantsToJoin = 'User wants to join your session';
translations.en.noJoinRequests = 'No join requests yet';
translations.en.noSessions = 'No sessions yet';

translations.es.matches = 'Coincidencias';
translations.es.joinRequests = 'Solicitudes';
translations.es.myTribe = 'Mi Tribu';
translations.es.newJoinRequest = 'Nueva Solicitud';
translations.es.userWantsToJoin = 'Usuario quiere unirse a tu sesión';
translations.es.noJoinRequests = 'Sin solicitudes aún';
translations.es.noSessions = 'Sin sesiones aún';

translations.en.sportsActivities = 'Sports & Activities';
translations.es.sportsActivities = 'Deportes y Actividades';


translations.en.share = 'Share';
translations.es.share = 'Compartir';

translations.en.curated = 'Curated';
translations.es.curated = 'Curado';

translations.en.private = 'Private';
translations.es.private = 'Privada';
