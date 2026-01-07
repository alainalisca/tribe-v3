export type MessageCategory = 'morning_motivation' | 'session_nearby' | 'weekly_recap' | 're_engagement';

export interface BilingualMessage {
  en: { title: string; body: string };
  es: { title: string; body: string };
}

export interface MessageBank {
  morning_motivation: BilingualMessage[];
  session_nearby: BilingualMessage[];
  weekly_recap: BilingualMessage[];
  re_engagement: BilingualMessage[];
}

export const messageBank: MessageBank = {
  morning_motivation: [
    {
      en: { title: "Rise and Train!", body: "Who's joining you for a workout today? Find partners on Tribe." },
      es: { title: "Arriba y a Entrenar!", body: "Quien te acompana a entrenar hoy? Encuentra companeros en Tribe." }
    },
    {
      en: { title: "Good Morning, Athlete!", body: "Never train alone - check out sessions near you." },
      es: { title: "Buenos Dias, Atleta!", body: "Nunca entrenes solo - mira las sesiones cerca de ti." }
    },
    {
      en: { title: "Start Your Day Strong!", body: "Your tribe is ready to train. Are you?" },
      es: { title: "Empieza el Dia Fuerte!", body: "Tu tribu esta lista para entrenar. Y tu?" }
    },
    {
      en: { title: "Morning Motivation!", body: "Today's sessions are live - find your workout crew." },
      es: { title: "Motivacion Matutina!", body: "Las sesiones de hoy estan activas - encuentra tu equipo." }
    },
    {
      en: { title: "Don't Skip Today!", body: "Your fitness community awaits. Join a session now." },
      es: { title: "No Te Lo Saltes Hoy!", body: "Tu comunidad fitness te espera. Unete a una sesion." }
    },
    {
      en: { title: "Make Today Count!", body: "Every workout is better with a partner." },
      es: { title: "Haz Que Hoy Cuente!", body: "Cada entrenamiento es mejor con un companero." }
    },
    {
      en: { title: "Your Tribe Awaits!", body: "New sessions posted - never train alone again." },
      es: { title: "Tu Tribu Te Espera!", body: "Nuevas sesiones publicadas - nunca entrenes solo." }
    },
    {
      en: { title: "Fresh Start!", body: "Begin your day with a group workout - find one now." },
      es: { title: "Nuevo Comienzo!", body: "Empieza tu dia con un entrenamiento grupal." }
    },
    {
      en: { title: "Morning Energy!", body: "Training partners boost your motivation by 60%." },
      es: { title: "Energia Matutina!", body: "Los companeros aumentan tu motivacion un 60%." }
    },
    {
      en: { title: "Rise, Shine, Train!", body: "Check today's sessions and find your tribe." },
      es: { title: "Arriba, Brilla, Entrena!", body: "Mira las sesiones de hoy y encuentra tu tribu." }
    },
    {
      en: { title: "Better Together!", body: "Group workouts = better results. Find a session." },
      es: { title: "Mejor Juntos!", body: "Entrenamientos grupales = mejores resultados." }
    },
    {
      en: { title: "No Excuses Today!", body: "Your workout partners are waiting on Tribe." },
      es: { title: "Sin Excusas Hoy!", body: "Tus companeros de entrenamiento te esperan en Tribe." }
    },
    {
      en: { title: "Champion's Morning!", body: "Winners train together. Find your crew today." },
      es: { title: "Manana de Campeon!", body: "Los ganadores entrenan juntos. Encuentra tu equipo." }
    },
    {
      en: { title: "New Day, New Gains!", body: "Sessions available near you - join the movement." },
      es: { title: "Nuevo Dia, Nuevas Ganancias!", body: "Sesiones disponibles cerca de ti - unete al movimiento." }
    },
    {
      en: { title: "Your Best Self Awaits!", body: "Train with others and push your limits today." },
      es: { title: "Tu Mejor Version Te Espera!", body: "Entrena con otros y supera tus limites hoy." }
    },
    {
      en: { title: "Morning Call to Action!", body: "Don't be a solo trainer - find your tribe." },
      es: { title: "Llamado a la Accion!", body: "No entrenes solo - encuentra tu tribu." }
    },
    {
      en: { title: "Workout Buddies Needed!", body: "Join a session and make training social." },
      es: { title: "Se Necesitan Companeros!", body: "Unete a una sesion y haz el entrenamiento social." }
    },
    {
      en: { title: "Community Gains!", body: "The best workouts happen together. Check sessions." },
      es: { title: "Ganancias Comunitarias!", body: "Los mejores entrenamientos son juntos. Mira sesiones." }
    },
    {
      en: { title: "Ready to Crush It?", body: "Your training crew is one tap away." },
      es: { title: "Listo Para Romperla?", body: "Tu equipo de entrenamiento esta a un toque." }
    },
    {
      en: { title: "Train Like a Team!", body: "Solo workouts are out. Group training is in." },
      es: { title: "Entrena Como Equipo!", body: "Entrenar solo ya paso. El grupo es lo de hoy." }
    }
  ],

  session_nearby: [
    {
      en: { title: "Session Near You!", body: "A {{sport}} session is happening nearby. Don't miss it!" },
      es: { title: "Sesion Cerca de Ti!", body: "Una sesion de {{sport}} esta cerca. No te la pierdas!" }
    },
    {
      en: { title: "Training Happening Now!", body: "{{sport}} session just {{distance}} away. Join in!" },
      es: { title: "Entrenamiento en Curso!", body: "Sesion de {{sport}} a solo {{distance}}. Unete!" }
    },
    {
      en: { title: "Join the Action!", body: "{{count}} people are training {{sport}} near you." },
      es: { title: "Unete a la Accion!", body: "{{count}} personas entrenan {{sport}} cerca de ti." }
    },
    {
      en: { title: "Don't Train Alone!", body: "There's a {{sport}} session {{distance}} from you." },
      es: { title: "No Entrenes Solo!", body: "Hay una sesion de {{sport}} a {{distance}} de ti." }
    },
    {
      en: { title: "Workout Alert!", body: "{{sport}} happening nearby. Perfect timing to join." },
      es: { title: "Alerta de Entrenamiento!", body: "{{sport}} cerca de ti. Momento perfecto para unirte." }
    },
    {
      en: { title: "Your Tribe is Close!", body: "Found a {{sport}} session near your location." },
      es: { title: "Tu Tribu Esta Cerca!", body: "Encontramos una sesion de {{sport}} cerca de ti." }
    },
    {
      en: { title: "Local Training!", body: "{{sport}} session available in your area right now." },
      es: { title: "Entrenamiento Local!", body: "Sesion de {{sport}} disponible en tu zona ahora." }
    },
    {
      en: { title: "Spots Available!", body: "A {{sport}} session near you has {{spots}} spots left." },
      es: { title: "Lugares Disponibles!", body: "Una sesion de {{sport}} cerca tiene {{spots}} lugares." }
    },
    {
      en: { title: "Perfect Match!", body: "{{sport}} session matches your interests - {{distance}} away." },
      es: { title: "Coincidencia Perfecta!", body: "Sesion de {{sport}} coincide con tus intereses - a {{distance}}." }
    },
    {
      en: { title: "Nearby Activity!", body: "Athletes are gathering for {{sport}} close to you." },
      es: { title: "Actividad Cercana!", body: "Atletas se reunen para {{sport}} cerca de ti." }
    }
  ],

  weekly_recap: [
    {
      en: { title: "Your Week in Review!", body: "You joined {{count}} sessions this week. Keep the momentum!" },
      es: { title: "Tu Semana en Resumen!", body: "Te uniste a {{count}} sesiones esta semana. Sigue asi!" }
    },
    {
      en: { title: "Weekly Tribe Stats!", body: "{{count}} workouts completed. {{next_goal}} to beat last week!" },
      es: { title: "Estadisticas Semanales!", body: "{{count}} entrenamientos completados. {{next_goal}} para superar la semana pasada!" }
    },
    {
      en: { title: "Week Accomplished!", body: "You trained with {{partners}} people this week. Great connections!" },
      es: { title: "Semana Lograda!", body: "Entrenaste con {{partners}} personas esta semana. Grandes conexiones!" }
    },
    {
      en: { title: "Community Impact!", body: "Your sessions helped {{others}} athletes never train alone." },
      es: { title: "Impacto Comunitario!", body: "Tus sesiones ayudaron a {{others}} atletas a no entrenar solos." }
    },
    {
      en: { title: "Progress Report!", body: "This week: {{sessions}} sessions, {{hours}} hours trained." },
      es: { title: "Reporte de Progreso!", body: "Esta semana: {{sessions}} sesiones, {{hours}} horas entrenadas." }
    },
    {
      en: { title: "You're on Fire!", body: "{{streak}} day training streak! Keep it going next week." },
      es: { title: "Estas en Llamas!", body: "Racha de {{streak}} dias! Sigue asi la proxima semana." }
    },
    {
      en: { title: "Week Highlights!", body: "Most active day: {{day}}. Top sport: {{sport}}." },
      es: { title: "Destacados de la Semana!", body: "Dia mas activo: {{day}}. Deporte top: {{sport}}." }
    },
    {
      en: { title: "Tribe Growing!", body: "You connected with {{new_connections}} new training partners." },
      es: { title: "Tribu Creciendo!", body: "Conectaste con {{new_connections}} nuevos companeros." }
    },
    {
      en: { title: "Weekly Champion!", body: "You showed up {{count}} times this week. Consistency wins!" },
      es: { title: "Campeon Semanal!", body: "Apareciste {{count}} veces esta semana. La constancia gana!" }
    },
    {
      en: { title: "Keep Building!", body: "Next week's goal: beat this week's {{count}} sessions." },
      es: { title: "Sigue Construyendo!", body: "Meta de la proxima semana: superar las {{count}} sesiones de esta." }
    }
  ],

  re_engagement: [
    {
      en: { title: "We Miss You!", body: "Your tribe is training without you. Come back and join!" },
      es: { title: "Te Extranamos!", body: "Tu tribu esta entrenando sin ti. Vuelve y unete!" }
    },
    {
      en: { title: "Don't Break the Streak!", body: "It's been {{days}} days. Get back on track today." },
      es: { title: "No Rompas la Racha!", body: "Han pasado {{days}} dias. Vuelve al ritmo hoy." }
    },
    {
      en: { title: "Your Partners Miss You!", body: "New sessions in your area - time to return." },
      es: { title: "Tus Companeros Te Extranan!", body: "Nuevas sesiones en tu zona - es hora de volver." }
    },
    {
      en: { title: "Time to Come Back!", body: "{{count}} new sessions since your last workout." },
      es: { title: "Es Hora de Volver!", body: "{{count}} nuevas sesiones desde tu ultimo entrenamiento." }
    },
    {
      en: { title: "Your Tribe Needs You!", body: "Sessions are waiting. Never train alone - join again!" },
      es: { title: "Tu Tribu Te Necesita!", body: "Hay sesiones esperando. Nunca entrenes solo - unete!" }
    },
    {
      en: { title: "Fresh Start!", body: "Every champion takes breaks. Ready to jump back in?" },
      es: { title: "Nuevo Comienzo!", body: "Todo campeon toma descansos. Listo para volver?" }
    },
    {
      en: { title: "Comeback Time!", body: "Your fitness journey continues. Find a session today." },
      es: { title: "Hora del Regreso!", body: "Tu viaje fitness continua. Encuentra una sesion hoy." }
    },
    {
      en: { title: "We've Got Sessions!", body: "Perfect opportunities to never train alone again." },
      es: { title: "Tenemos Sesiones!", body: "Oportunidades perfectas para nunca entrenar solo." }
    },
    {
      en: { title: "Athletes Are Waiting!", body: "{{count}} sessions available in your area right now." },
      es: { title: "Atletas Te Esperan!", body: "{{count}} sesiones disponibles en tu zona ahora mismo." }
    },
    {
      en: { title: "Back in Action?", body: "One tap to reconnect with your training community." },
      es: { title: "De Vuelta a la Accion?", body: "Un toque para reconectarte con tu comunidad." }
    }
  ]
};

// Legacy export for backwards compatibility with existing code
export const motivationalMessages = messageBank.morning_motivation;

/**
 * Get a random message from a specific category
 * @param category - The category of messages to select from
 * @param usedMessageIds - Optional array of message indices already sent to avoid repeats
 * @returns The selected message and its index
 */
export function getRandomMessage(
  category: MessageCategory = 'morning_motivation',
  usedMessageIds: number[] = []
): { message: BilingualMessage; index: number } {
  const messages = messageBank[category];

  // Filter out already used messages
  const availableIndices = messages
    .map((_, i) => i)
    .filter(i => !usedMessageIds.includes(i));

  // If all messages have been used, reset and pick from all
  const indicesToChooseFrom = availableIndices.length > 0
    ? availableIndices
    : messages.map((_, i) => i);

  const randomIndex = indicesToChooseFrom[Math.floor(Math.random() * indicesToChooseFrom.length)];

  return {
    message: messages[randomIndex],
    index: randomIndex
  };
}

/**
 * Get message content in the specified language
 * @param message - The bilingual message
 * @param language - The preferred language ('en' or 'es')
 * @returns The message content in the specified language
 */
export function getMessageContent(
  message: BilingualMessage,
  language: 'en' | 'es' = 'en'
): { title: string; body: string } {
  return message[language] || message.en;
}

/**
 * Replace template variables in message content
 * @param content - The message content with placeholders
 * @param variables - Object containing variable values
 * @returns The message with replaced variables
 */
export function replaceMessageVariables(
  content: { title: string; body: string },
  variables: Record<string, string | number>
): { title: string; body: string } {
  let { title, body } = content;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    title = title.replace(new RegExp(placeholder, 'g'), String(value));
    body = body.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return { title, body };
}

/**
 * Get all categories available in the message bank
 */
export function getCategories(): MessageCategory[] {
  return Object.keys(messageBank) as MessageCategory[];
}

/**
 * Get the count of messages in a specific category
 */
export function getCategoryMessageCount(category: MessageCategory): number {
  return messageBank[category].length;
}
