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
    noMessagesYet: 'No messages yet',
    startConversation: 'Start the conversation!',
    noConversations: 'No conversations yet',
    joinSessionToChat: 'Join a session to start chatting with other participants',

    // Session Actions
    sessionCreated: 'Session created!',
    sessionFullMsg: 'This session is full',
    alreadyJoined: 'You already joined this session!',
    joinedSuccessfully: "You're in! Never train alone.",
    ended: 'Ended',
    duration: 'Duration',

    // Matches/Tribe
    matches: 'Matches',
    myTribe: 'My Tribe',
    noJoinRequests: 'No join requests',
    newJoinRequest: 'New join request',
    userWantsToJoin: 'wants to join your session',
    noSessions: 'No sessions',

    // Session Reminders
    sessionReminders: 'Session Reminders',
    sessionRemindersDesc: '1 hour & 15 min before your sessions',
    reminderOneHourTitle: 'Session in 1 hour!',
    reminderOneHourBody: 'starts in 1 hour. Get ready!',
    reminderFifteenMinTitle: 'Session starting soon!',
    reminderFifteenMinBody: 'starts in 15 minutes. Head out now!',
    remindersEnabled: 'Reminders enabled',
    remindersDisabled: 'Reminders disabled',

    // Gender Preferences
    genderPreference: 'Who can join',
    allWelcome: 'All Welcome',
    womenOnly: 'Women Only',
    menOnly: 'Men Only',
    filterByGender: 'Filter by gender',

    // Equipment
    equipment: 'Equipment Needed',
    equipmentPlaceholder: 'e.g. Yoga mat, running shoes, water bottle',
    equipmentNeeded: 'Equipment needed',

    // Ratings & Reviews
    rateThisSession: 'Rate this session',
    howWasYourExperience: 'How was your experience with the host?',
    leaveAComment: 'Leave a comment (optional)',
    submitReview: 'Submit Review',
    thankYouForReview: 'Thank you for your review!',
    alreadyReviewed: 'You already reviewed this session',
    hostRating: 'Host Rating',
    reviews: 'reviews',
    noReviewsYet: 'No reviews yet',
  },

  es: {
    // Navegacion
    home: 'Inicio',
    mySessions: 'Mis Sesiones',
    create: 'Crear',
    messages: 'Mensajes',
    requests: 'Solicitudes',
    profile: 'Perfil',

    // Pagina de Solicitudes
    joinRequests: 'Solicitudes de Union',
    noRequests: 'No hay solicitudes pendientes',
    accept: 'Aceptar',
    decline: 'Rechazar',
    viewProfile: 'Ver Perfil',
    anonymous: 'Usuario Anonimo',

    // Comun
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
    noSessionsFound: 'Aun no hay sesiones',
    noSessionsYet: 'Aun no hay sesiones',
    createFirstSession: 'Crea tu primera sesion para encontrar companeros de entrenamiento',
    tryDifferentSearch: 'Se el primero! Crea una sesion y nunca entrenes solo.',

    // Tarjeta de Sesion
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
    noHostingSessions: 'No hay sesiones aun',
    noJoinedSessions: 'No hay sesiones unidas',
    browseHomePage: 'Navega la pagina principal para encontrar sesiones',
    findSessions: 'Buscar Sesiones',

    // Crear Sesion
    createSession: 'Crear Sesion',
    sport: 'Deporte',
    date: 'Fecha',
    time: 'Hora',
    selectSport: 'Selecciona un deporte',
    startTime: 'Hora de Inicio',
    location: 'Ubicacion',
    maxParticipants: 'Maximo de Participantes',
    description: 'Descripcion',
    skillLevel: 'Nivel',
    beginner: 'Principiante',
    intermediate: 'Intermedio',
    advanced: 'Avanzado',
    allLevels: 'Todos los Niveles',

    // Perfil
    editProfile: 'Editar Perfil',
    name: 'Nombre',
    bio: 'Biografia',
    sportsActivities: 'Actividades Deportivas',
    photos: 'Fotos',

    // Configuracion
    settings: 'Configuracion',
    language: 'Idioma',
    notifications: 'Notificaciones',
    privacy: 'Privacidad',
    logout: 'Cerrar Sesion',

    // Autenticacion
    signIn: 'Iniciar Sesion',
    signUp: 'Registrarse',
    email: 'Correo Electronico',
    password: 'Contrasena',
    forgotPassword: 'Olvidaste tu Contrasena?',

    // Chat
    noMessagesYet: 'No hay mensajes aun',
    startConversation: 'Inicia la conversacion!',
    noConversations: 'No hay conversaciones aun',
    joinSessionToChat: 'Unete a una sesion para chatear con otros participantes',

    // Session Actions
    sessionCreated: 'Sesion creada!',
    sessionFullMsg: 'Esta sesion esta llena',
    alreadyJoined: 'Ya te uniste a esta sesion!',
    joinedSuccessfully: 'Estas dentro! Nunca entrenes solo.',
    ended: 'Terminado',
    duration: 'Duracion',

    // Matches/Tribe
    matches: 'Coincidencias',
    myTribe: 'Mi Tribu',
    noJoinRequests: 'Sin solicitudes',
    newJoinRequest: 'Nueva solicitud',
    userWantsToJoin: 'quiere unirse a tu sesion',
    noSessions: 'Sin sesiones',

    // Session Reminders
    sessionReminders: 'Recordatorios de Sesion',
    sessionRemindersDesc: '1 hora y 15 min antes de tus sesiones',
    reminderOneHourTitle: 'Sesion en 1 hora!',
    reminderOneHourBody: 'comienza en 1 hora. Preparate!',
    reminderFifteenMinTitle: 'La sesion empieza pronto!',
    reminderFifteenMinBody: 'comienza en 15 minutos. Sal ya!',
    remindersEnabled: 'Recordatorios activados',
    remindersDisabled: 'Recordatorios desactivados',

    // Gender Preferences
    genderPreference: 'Quien puede unirse',
    allWelcome: 'Todos Bienvenidos',
    womenOnly: 'Solo Mujeres',
    menOnly: 'Solo Hombres',
    filterByGender: 'Filtrar por genero',

    // Equipment
    equipment: 'Equipo Necesario',
    equipmentPlaceholder: 'ej. Tapete de yoga, tenis, botella de agua',
    equipmentNeeded: 'Equipo necesario',

    // Ratings & Reviews
    rateThisSession: 'Califica esta sesion',
    howWasYourExperience: 'Como fue tu experiencia con el anfitrion?',
    leaveAComment: 'Deja un comentario (opcional)',
    submitReview: 'Enviar Resena',
    thankYouForReview: 'Gracias por tu resena!',
    alreadyReviewed: 'Ya calificaste esta sesion',
    hostRating: 'Calificacion del Anfitrion',
    reviews: 'resenas',
    noReviewsYet: 'Sin resenas aun',
  },
};
export type TranslationKey = keyof typeof translations.en;
export { sportTranslations } from './sportTranslationData';
