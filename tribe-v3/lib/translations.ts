export type Language = 'en' | 'es';

export const translations = {
  en: {
    // Navigation
    home: 'Home',
    mySessions: 'My Sessions',
    create: 'Create',
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
  },
  
  es: {
    // Navegación
    home: 'Inicio',
    mySessions: 'Mis Sesiones',
    create: 'Crear',
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
  }
};

export type TranslationKey = keyof typeof translations.en;

// Sport translations for Colombia/Medellín market
export const sportTranslations = {
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
