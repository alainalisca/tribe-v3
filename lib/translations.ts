export type Language = 'en' | 'es';

export const translations = {
  en: {
    // Navigation
    home: 'Home',
    mySessions: 'My Sessions',
    create: 'Create',
    messages: 'Messages',
    requests: 'Requests',
    profile: 'Profile',
    
    // Requests Page
    joinRequests: 'Join Requests',
    noRequests: 'No pending requests',
    accept: 'Accept',
    decline: 'Decline',
    viewProfile: 'View Profile',
    anonymous: 'Anonymous User',
    
    // Common
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    close: 'Close',
    search: 'Search sessions...',
    searchPlaceholder: 'Search sessions...',
    clearAll: 'Clear all',
    sessionsCount: 'sessions',
    noSessionsFound: 'No sessions yet',
    noSessionsYet: 'No sessions yet',
    createFirstSession: 'Create your first session to find training partners',
    tryDifferentSearch: 'Be the first! Create a session and never train alone.',
    
    // Session Card
    spots: 'spots',
    spotsLeft: 'spots left',
    share: 'Share',
    chat: 'Chat',
    joined: 'Joined',
    pending: 'Pending',
    full: 'Full',
    join: 'Join',
    past: 'Past',
    viewDetails: 'View Details',
    hostedBy: 'Hosted by',
    away: 'away',
    
    // My Sessions
    hosting: 'Hosting',
    joinedSessions: 'Joined',
    noHostingSessions: 'No sessions yet',
    noJoinedSessions: 'No joined sessions',
    browseHomePage: 'Browse the home page to find sessions',
    findSessions: 'Find Sessions',
    
    // Create Session
    createSession: 'Create Session',
    sport: 'Sport',
    date: 'Date',
    time: 'Time',
    selectSport: 'Select a sport',
    startTime: 'Start Time',
    location: 'Location',
    maxParticipants: 'Max Participants',
    description: 'Description',
    skillLevel: 'Skill Level',
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
    allLevels: 'All Levels',
    
    // Profile
    editProfile: 'Edit Profile',
    name: 'Name',
    bio: 'Bio',
    sportsActivities: 'Sports Activities',
    photos: 'Photos',
    
    // Settings
    settings: 'Settings',
    language: 'Language',
    notifications: 'Notifications',
    privacy: 'Privacy',
    logout: 'Logout',
    
    // Auth
    signIn: 'Sign In',
    signUp: 'Sign Up',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot Password?',
    
    // Chat
    noMessagesYet: "No messages yet",
    startConversation: "Start the conversation!",
    noConversations: "No conversations yet",
    joinSessionToChat: "Join a session to start chatting with other participants",

    // Session Actions
    sessionCreated: "Session created!",
    sessionFullMsg: "This session is full",
    alreadyJoined: "You already joined this session!",
    joinedSuccessfully: "You're in! Never train alone.",
    ended: "Ended",
    duration: "Duration",

    // Matches/Tribe
    matches: "Matches",
    myTribe: "My Tribe",
    noJoinRequests: "No join requests",
    newJoinRequest: "New join request",
    userWantsToJoin: "wants to join your session",
    noSessions: "No sessions",

    // Session Reminders
    sessionReminders: "Session Reminders",
    sessionRemindersDesc: "1 hour & 15 min before your sessions",
    reminderOneHourTitle: "Session in 1 hour!",
    reminderOneHourBody: "starts in 1 hour. Get ready!",
    reminderFifteenMinTitle: "Session starting soon!",
    reminderFifteenMinBody: "starts in 15 minutes. Head out now!",
    remindersEnabled: "Reminders enabled",
    remindersDisabled: "Reminders disabled",
  },
  
  es: {
    // Navegación
    home: 'Inicio',
    mySessions: 'Mis Sesiones',
    create: 'Crear',
    messages: 'Mensajes',
    requests: 'Solicitudes',
    profile: 'Perfil',
    
    // Página de Solicitudes
    joinRequests: 'Solicitudes de Unión',
    noRequests: 'No hay solicitudes pendientes',
    accept: 'Aceptar',
    decline: 'Rechazar',
    viewProfile: 'Ver Perfil',
    anonymous: 'Usuario Anónimo',
    
    // Común
    loading: 'Cargando...',
    save: 'Guardar',
    cancel: 'Cancelar',
    edit: 'Editar',
    delete: 'Eliminar',
    close: 'Cerrar',
    search: 'Buscar sesiones...',
    searchPlaceholder: 'Buscar sesiones...',
    clearAll: 'Limpiar todo',
    sessionsCount: 'sesiones',
    noSessionsFound: 'Aún no hay sesiones',
    noSessionsYet: 'Aún no hay sesiones',
    createFirstSession: 'Crea tu primera sesión para encontrar compañeros de entrenamiento',
    tryDifferentSearch: '¡Sé el primero! Crea una sesión y nunca entrenes solo.',
    
    // Tarjeta de Sesión
    spots: 'espacios',
    spotsLeft: 'lugares disponibles',
    share: 'Compartir',
    chat: 'Chat',
    joined: 'Unido',
    pending: 'Pendiente',
    full: 'Lleno',
    join: 'Unirse',
    past: 'Pasado',
    viewDetails: 'Ver Detalles',
    hostedBy: 'Organizado por',
    away: 'de distancia',
    
    // Mis Sesiones
    hosting: 'Organizando',
    joinedSessions: 'Unido',
    noHostingSessions: 'No hay sesiones aún',
    noJoinedSessions: 'No hay sesiones unidas',
    browseHomePage: 'Navega la página principal para encontrar sesiones',
    findSessions: 'Buscar Sesiones',
    
    // Crear Sesión
    createSession: 'Crear Sesión',
    sport: 'Deporte',
    date: 'Fecha',
    time: 'Hora',
    selectSport: 'Selecciona un deporte',
    startTime: 'Hora de Inicio',
    location: 'Ubicación',
    maxParticipants: 'Máximo de Participantes',
    description: 'Descripción',
    skillLevel: 'Nivel',
    beginner: 'Principiante',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
    allLevels: 'Todos los Niveles',
    
    // Perfil
    editProfile: 'Editar Perfil',
    name: 'Nombre',
    bio: 'Biografía',
    sportsActivities: 'Actividades Deportivas',
    photos: 'Fotos',
    
    // Configuración
    settings: 'Configuración',
    language: 'Idioma',
    notifications: 'Notificaciones',
    privacy: 'Privacidad',
    logout: 'Cerrar Sesión',
    
    // Autenticación
    signIn: 'Iniciar Sesión',
    signUp: 'Registrarse',
    email: 'Correo Electrónico',
    password: 'Contraseña',
    forgotPassword: '¿Olvidaste tu Contraseña?',
    
    // Chat
    noMessagesYet: "No hay mensajes aún",
    startConversation: "¡Inicia la conversación!",
    noConversations: "No hay conversaciones aún",
    joinSessionToChat: "Únete a una sesión para chatear con otros participantes",

    // Session Actions
    sessionCreated: "¡Sesión creada!",
    sessionFullMsg: "Esta sesión está llena",
    alreadyJoined: "¡Ya te uniste a esta sesión!",
    joinedSuccessfully: "¡Estás dentro! Nunca entrenes solo.",
    ended: "Terminado",
    duration: "Duración",

    // Matches/Tribe
    matches: "Coincidencias",
    myTribe: "Mi Tribu",
    noJoinRequests: "Sin solicitudes",
    newJoinRequest: "Nueva solicitud",
    userWantsToJoin: "quiere unirse a tu sesión",
    noSessions: "Sin sesiones",

    // Session Reminders
    sessionReminders: "Recordatorios de Sesión",
    sessionRemindersDesc: "1 hora y 15 min antes de tus sesiones",
    reminderOneHourTitle: "¡Sesión en 1 hora!",
    reminderOneHourBody: "comienza en 1 hora. ¡Prepárate!",
    reminderFifteenMinTitle: "¡La sesión empieza pronto!",
    reminderFifteenMinBody: "comienza en 15 minutos. ¡Sal ya!",
    remindersEnabled: "Recordatorios activados",
    remindersDisabled: "Recordatorios desactivados",
  }
};

export type TranslationKey = keyof typeof translations.en;

// Sport translations for Colombia/Medellín market
export const sportTranslations: { [key: string]: { en: string; es: string } } = {
  'All': { en: 'All', es: 'Todos' },
  'Running': { en: 'Running', es: 'Correr' },
  'Hiking': { en: 'Hiking', es: 'Senderismo' },
  'Cycling': { en: 'Cycling', es: 'Ciclismo' },
  'Swimming': { en: 'Swimming', es: 'Natación' },
  'CrossFit': { en: 'CrossFit', es: 'CrossFit' },
  'Weightlifting': { en: 'Weightlifting', es: 'Levantamiento de Pesas' },
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
  'Skateboarding': { en: 'Skateboarding', es: 'Patinaje' },
  'BMX': { en: 'BMX', es: 'BMX' },
  'Other': { en: 'Other', es: 'Otro' }
};
