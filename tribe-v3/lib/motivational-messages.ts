export const motivationalMessages = [
  {
    en: {
      title: "Never Train Alone! 🏃",
      body: "Check out today's sessions and find your next workout buddy"
    },
    es: {
      title: "¡Nunca Entrenes Solo! 🏃",
      body: "Mira las sesiones de hoy y encuentra tu próximo compañero de entrenamiento"
    }
  },
  {
    en: {
      title: "Your Tribe is Waiting! 💪",
      body: "Join a session today - never train alone again"
    },
    es: {
      title: "¡Tu Tribu Te Espera! 💪",
      body: "Únete a una sesión hoy - nunca más entrenes solo"
    }
  },
  {
    en: {
      title: "Don't Train Alone Today! 🔥",
      body: "Find a session that fits your schedule and join your tribe"
    },
    es: {
      title: "¡No Entrenes Solo Hoy! 🔥",
      body: "Encuentra una sesión que se ajuste a tu horario y únete a tu tribu"
    }
  },
  {
    en: {
      title: "New Sessions Available! 🎯",
      body: "Discover new activities so you never have to train alone"
    },
    es: {
      title: "¡Nuevas Sesiones Disponibles! 🎯",
      body: "Descubre nuevas actividades para nunca entrenar solo"
    }
  },
  {
    en: {
      title: "Make Today Count! ⚡",
      body: "Every workout is better together - browse sessions now"
    },
    es: {
      title: "¡Haz Que Hoy Cuente! ⚡",
      body: "Cada entrenamiento es mejor en grupo - explora sesiones ahora"
    }
  },
  {
    en: {
      title: "Your Community Needs You! 🌟",
      body: "Host a session and help others never train alone"
    },
    es: {
      title: "¡Tu Comunidad Te Necesita! 🌟",
      body: "Organiza una sesión y ayuda a otros a nunca entrenar solos"
    }
  },
  {
    en: {
      title: "Train Together, Win Together! 🏆",
      body: "Group workouts are 40% more effective - find yours today"
    },
    es: {
      title: "¡Entrena Juntos, Gana Juntos! 🏆",
      body: "Los entrenamientos en grupo son 40% más efectivos - encuentra el tuyo"
    }
  },
  {
    en: {
      title: "Training Alone? Not Anymore! 💥",
      body: "Your next workout partner is one tap away"
    },
    es: {
      title: "¿Entrenando Solo? ¡Ya No Más! 💥",
      body: "Tu próximo compañero de entrenamiento está a un toque"
    }
  },
  {
    en: {
      title: "Better Together! 🤝",
      body: "Find your tribe and never train alone again"
    },
    es: {
      title: "¡Mejor Juntos! 🤝",
      body: "Encuentra tu tribu y nunca más entrenes solo"
    }
  },
  {
    en: {
      title: "Your Fitness Community Awaits! 🌍",
      body: "Join sessions near you - because training alone is over"
    },
    es: {
      title: "¡Tu Comunidad Fitness Te Espera! 🌍",
      body: "Únete a sesiones cerca de ti - porque entrenar solo ya pasó"
    }
  }
];

export function getRandomMessage() {
  return motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
}
