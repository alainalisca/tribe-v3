export const motivationalMessages = [
  {
    en: {
      title: "Let's Get Moving! 🏃",
      body: "Check out today's sessions and find your next workout buddy"
    },
    es: {
      title: "¡A Moverse! 🏃",
      body: "Mira las sesiones de hoy y encuentra tu próximo compañero de entrenamiento"
    }
  },
  {
    en: {
      title: "Your Tribe is Waiting! 💪",
      body: "Join a session today and connect with active people"
    },
    es: {
      title: "¡Tu Tribu Te Espera! 💪",
      body: "Únete a una sesión hoy y conéctate con gente activa"
    }
  },
  {
    en: {
      title: "Don't Skip Today! 🔥",
      body: "Consistency is key - find a session that fits your schedule"
    },
    es: {
      title: "¡No Te Saltes Hoy! 🔥",
      body: "La constancia es clave - encuentra una sesión que se ajuste a tu horario"
    }
  },
  {
    en: {
      title: "New Sessions Available! 🎯",
      body: "Discover new activities and meet fitness enthusiasts near you"
    },
    es: {
      title: "¡Nuevas Sesiones Disponibles! 🎯",
      body: "Descubre nuevas actividades y conoce entusiastas del fitness cerca de ti"
    }
  },
  {
    en: {
      title: "Make Today Count! ⚡",
      body: "Every workout is a step forward - browse sessions now"
    },
    es: {
      title: "¡Haz Que Hoy Cuente! ⚡",
      body: "Cada entrenamiento es un paso adelante - explora sesiones ahora"
    }
  },
  {
    en: {
      title: "Your Community Needs You! 🌟",
      body: "Be the motivation someone else needs - host or join a session"
    },
    es: {
      title: "¡Tu Comunidad Te Necesita! 🌟",
      body: "Sé la motivación que alguien más necesita - organiza o únete a una sesión"
    }
  },
  {
    en: {
      title: "Train Together, Win Together! 🏆",
      body: "Group workouts are 40% more effective - find yours today"
    },
    es: {
      title: "¡Entrena Juntos, Gana Juntos! 🏆",
      body: "Los entrenamientos en grupo son 40% más efectivos - encuentra el tuyo hoy"
    }
  }
];

export function getRandomMessage() {
  return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
}
