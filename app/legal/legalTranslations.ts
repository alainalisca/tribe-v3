/** Legal page translations — Terms, Privacy, Safety */

interface TermsSection {
  heading: string;
  warning?: string;
  paragraphs: Array<{ text: string; italic?: boolean }>;
  list?: string[];
  contact?: boolean;
}

interface TermsContent {
  title: string;
  lastUpdated: string;
  businessName: string;
  sections: TermsSection[];
}

export function getTermsContent(language: 'en' | 'es'): TermsContent {
  if (language === 'es') {
    return {
      title: 'Terminos de Servicio',
      lastUpdated: 'Ultima actualizacion: 24 de noviembre de 2025',
      businessName: 'Razon social: A Plus Fitness LLC',
      sections: [
        {
          heading: '1. ACEPTACION DE LOS TERMINOS',
          paragraphs: [
            {
              text: 'Al acceder, descargar o utilizar la aplicacion movil Tribe, el sitio web o los servicios relacionados (colectivamente, la "Plataforma"), usted acepta regirse por estos Terminos de Servicio ("Terminos") y nuestra Politica de Privacidad, la cual se incorpora por referencia.',
            },
            { text: 'Si no esta de acuerdo con estos Terminos, no debe acceder ni utilizar Tribe.' },
          ],
        },
        {
          heading: '2. ELEGIBILIDAD',
          paragraphs: [
            { text: 'Para usar Tribe, usted debe:' },
            {
              text: 'Al crear una cuenta, usted declara y garantiza que toda la informacion proporcionada es verdadera, precisa y completa.',
            },
            {
              text: 'Tribe es operado por A Plus Fitness LLC, una sociedad de responsabilidad limitada de Nueva York, y actualmente se encuentra en fase de prueba beta en Medellin, Colombia.',
              italic: true,
            },
          ],
          list: [
            'Tener al menos 18 anos de edad (o la mayoria de edad legal en su jurisdiccion, si es mayor);',
            'Tener la capacidad legal para celebrar contratos vinculantes; y',
            'Usar la Plataforma unicamente con fines licitos y en cumplimiento de todas las leyes aplicables.',
          ],
        },
        {
          heading: '3. QUE ES TRIBE',
          paragraphs: [
            {
              text: 'Tribe es una plataforma digital disenada para ayudar a los usuarios a conectarse para actividades deportivas, de fitness y entrenamiento. Tribe facilita la presentacion y coordinacion entre usuarios, pero Tribe no es un proveedor de servicios, empleador, agente ni garante de ninguna actividad organizada a traves de la Plataforma.',
            },
            { text: 'Usted reconoce que:' },
            {
              text: 'Si bien Tribe puede ser accesible internacionalmente, estos Terminos se rigen por la legislacion estadounidense y la Plataforma se opera desde Nueva York.',
              italic: true,
            },
          ],
          list: [
            'Tribe no proporciona ni supervisa ningun servicio de entrenamiento, coaching o ejercicio.',
            'Tribe no verifica la identidad, calificaciones, certificaciones ni antecedentes de los usuarios.',
            'Tribe no supervisa, monitorea ni controla las acciones o conducta de ningun usuario, ya sea durante actividades presenciales o comunicaciones a traves de la Plataforma.',
            'Todos los usuarios actuan de manera independiente y bajo su propio riesgo.',
          ],
        },
        {
          heading: '4. SALUD Y ASUNCION DE RIESGOS',
          warning: '⚠️ IMPORTANTE - LEA DETENIDAMENTE',
          paragraphs: [
            {
              text: 'La actividad fisica y los deportes conllevan riesgos inherentes, incluyendo pero no limitados a lesiones graves, discapacidad permanente o muerte. Al participar en cualquier actividad organizada a traves de Tribe, usted acepta que:',
            },
            {
              text: 'Tribe renuncia a todas las garantias, expresas o implicitas, con respecto a la seguridad, idoneidad o resultados de cualquier actividad o sesion organizada a traves de la Plataforma.',
            },
          ],
          list: [
            'Usted asume voluntariamente todos los riesgos, conocidos y desconocidos, asociados con dicha participacion.',
            'Usted es el unico responsable de evaluar su propia condicion fisica, limitaciones y nivel de habilidad.',
            'Debe consultar a un medico calificado antes de realizar cualquier actividad fisica intensa.',
            'Tribe no es responsable de lesiones, accidentes, danos a la propiedad o perdidas derivadas de o relacionadas con la participacion en actividades coordinadas a traves de la Plataforma.',
          ],
        },
        {
          heading: '5. RESPONSABILIDADES Y CONDUCTA DEL USUARIO',
          paragraphs: [
            { text: 'Usted se compromete a usar la Plataforma de manera responsable y legal. No debe:' },
            {
              text: 'Tribe se reserva el derecho de investigar y tomar las acciones legales o administrativas apropiadas (incluyendo la suspension o terminacion de la cuenta) en casos de mala conducta.',
            },
          ],
          list: [
            'Acosar, perseguir, amenazar, intimidar o danar a cualquier persona;',
            'Publicar, cargar o transmitir material falso, enganoso, obsceno o difamatorio;',
            'Suplantar la identidad de otra persona o entidad;',
            'Participar en fraude, engano o tergiversacion;',
            'Usar Tribe para solicitudes comerciales, spam o publicidad;',
            'Violar cualquier ley o regulacion local, nacional o internacional; o',
            'Cargar o compartir contenido que infrinja derechos de propiedad intelectual, privacidad o publicidad de terceros.',
          ],
        },
        {
          heading: '12. RESOLUCION DE DISPUTAS',
          paragraphs: [
            {
              text: 'Entre Usuarios: Tribe no es responsable de mediar o resolver disputas entre usuarios. Debe resolver cualquier disputa directamente.',
            },
            {
              text: 'Con Tribe: Estos Terminos y cualquier disputa con Tribe se regiran e interpretaran de acuerdo con las leyes del Estado de Nueva York, Estados Unidos, sin tener en cuenta sus principios de conflicto de leyes. Usted acepta someterse a la jurisdiccion exclusiva de los tribunales estatales y federales ubicados en el Condado de Nueva York, Nueva York.',
            },
          ],
        },
        {
          heading: '15. INFORMACION DE CONTACTO',
          paragraphs: [
            {
              text: 'Las preguntas, asuntos legales o solicitudes relacionadas con estos Terminos pueden dirigirse a:',
            },
          ],
          contact: true,
        },
      ],
    };
  }

  return {
    title: 'Terms of Service',
    lastUpdated: 'Last Updated: November 24, 2025',
    businessName: 'Business Name: A Plus Fitness LLC',
    sections: [
      {
        heading: '1. ACCEPTANCE OF TERMS',
        paragraphs: [
          {
            text: 'By accessing, downloading, or using the Tribe mobile application, website, or related services (collectively, the "Platform"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy, which is incorporated herein by reference.',
          },
          { text: 'If you do not agree to these Terms, you must not access or use Tribe.' },
        ],
      },
      {
        heading: '2. ELIGIBILITY',
        paragraphs: [
          { text: 'To use Tribe, you must:' },
          {
            text: 'By creating an account, you represent and warrant that all information you provide is true, accurate, and complete.',
          },
          {
            text: 'Tribe is operated by A Plus Fitness LLC, a New York limited liability company, and is currently in beta testing in Medellin, Colombia.',
            italic: true,
          },
        ],
        list: [
          'Be at least 18 years of age (or the age of legal majority in your jurisdiction, if higher);',
          'Have the legal capacity to enter into binding contracts; and',
          'Use the Platform only for lawful purposes and in compliance with all applicable laws.',
        ],
      },
      {
        heading: '3. WHAT TRIBE IS',
        paragraphs: [
          {
            text: 'Tribe is a digital platform designed to help users connect for sports, fitness, and training activities. Tribe facilitates introductions and coordination between users, but Tribe is not a service provider, employer, agent, or guarantor of any activity arranged through the Platform.',
          },
          { text: 'You acknowledge that:' },
          {
            text: 'While Tribe may be accessed internationally, these Terms are governed by U.S. law and the Platform is operated from New York.',
            italic: true,
          },
        ],
        list: [
          'Tribe does not provide or supervise any training, coaching, or exercise services.',
          'Tribe does not verify the identity, qualifications, certifications, or backgrounds of users.',
          'Tribe does not oversee, monitor, or control the actions or conduct of any users, whether during in-person activities or communications via the Platform.',
          'All users act independently and at their own risk.',
        ],
      },
      {
        heading: '4. HEALTH AND ASSUMPTION OF RISK',
        warning: '⚠️ IMPORTANT - READ CAREFULLY',
        paragraphs: [
          {
            text: 'Physical activity and sports inherently involve risk, including but not limited to serious injury, permanent disability, or death. By participating in any activity arranged through Tribe, you agree that:',
          },
          {
            text: 'Tribe disclaims all warranties, express or implied, regarding safety, suitability, or outcomes of any activities or sessions arranged through the Platform.',
          },
        ],
        list: [
          'You voluntarily assume all risks, known and unknown, associated with such participation.',
          'You are solely responsible for evaluating your own physical condition, limitations, and skill level.',
          'You should consult a qualified physician before engaging in any strenuous physical activity.',
          'Tribe is not liable for any injuries, accidents, property damage, or losses arising out of or related to participation in any activity coordinated via the Platform.',
        ],
      },
      {
        heading: '5. USER RESPONSIBILITIES AND CONDUCT',
        paragraphs: [
          { text: 'You agree to use the Platform responsibly and lawfully. You must not:' },
          {
            text: 'Tribe reserves the right to investigate and take appropriate legal or administrative action (including account suspension or termination) in cases of misconduct.',
          },
        ],
        list: [
          'Harass, stalk, threaten, intimidate, or harm any person;',
          'Post, upload, or transmit any false, misleading, obscene, or defamatory material;',
          'Impersonate another individual or entity;',
          'Engage in fraud, deception, or misrepresentation;',
          'Use Tribe for commercial solicitation, spamming, or advertising;',
          'Violate any local, national, or international law or regulation; or',
          'Upload or share content that infringes intellectual property, privacy, or publicity rights of others.',
        ],
      },
      {
        heading: '12. DISPUTE RESOLUTION',
        paragraphs: [
          {
            text: 'Between Users: Tribe is not responsible for mediating or resolving disputes between users. You must resolve any disputes directly.',
          },
          {
            text: 'With Tribe: These Terms and any dispute with Tribe shall be governed by and construed in accordance with the laws of the State of New York, United States, without regard to its conflict of laws principles. You agree to submit to the exclusive jurisdiction of the state and federal courts located in New York County, New York.',
          },
        ],
      },
      {
        heading: '15. CONTACT INFORMATION',
        paragraphs: [{ text: 'Questions, legal concerns, or requests regarding these Terms may be directed to:' }],
        contact: true,
      },
    ],
  };
}

interface PrivacySection {
  heading: string;
  paragraphs: string[];
  list?: string[];
  highlight?: string;
  contact?: boolean;
  contactLabel?: string;
}

interface PrivacyContent {
  title: string;
  lastUpdated: string;
  businessName: string;
  sections: PrivacySection[];
}

export function getPrivacyContent(language: 'en' | 'es'): PrivacyContent {
  if (language === 'es') {
    return {
      title: 'Politica de Privacidad',
      lastUpdated: 'Ultima actualizacion: 24 de noviembre de 2025',
      businessName: 'Razon social: A Plus Fitness LLC',
      sections: [
        {
          heading: '1. Informacion que Recopilamos',
          paragraphs: ['Recopilamos la informacion que usted proporciona directamente:'],
          list: [
            'Informacion de cuenta: nombre, correo electronico, fecha de nacimiento, telefono (opcional)',
            'Informacion de perfil: fotos, biografia, deportes, niveles de habilidad, ubicacion (ciudad)',
            'Datos de uso: sesiones creadas/unidas, mensajes enviados, actividad en la app',
            'Datos de ubicacion: ubicacion aproximada cuando usa funciones de localizacion',
          ],
        },
        {
          heading: '2. Como Usamos su Informacion',
          paragraphs: ['Usamos su informacion para:'],
          list: [
            'Proporcionar el servicio Tribe (conectarlo con companeros de entrenamiento)',
            'Enviar notificaciones sobre sesiones y mensajes',
            'Mejorar la plataforma y la experiencia del usuario',
            'Prevenir fraude, abuso y garantizar la seguridad de la plataforma',
            'Comunicarnos con usted sobre actualizaciones y funciones',
          ],
        },
        {
          heading: '3. Compartir Informacion',
          paragraphs: ['Compartimos su informacion con:'],
          list: [
            '<strong>Otros usuarios:</strong> La informacion del perfil (nombre, foto, biografia, deportes, ubicacion) es visible para otros usuarios',
            '<strong>Proveedores de servicios:</strong> Hosting (Vercel), base de datos (Supabase), analiticas (PostHog)',
            '<strong>Requisitos legales:</strong> Cuando lo exija la ley o para proteger derechos y seguridad',
          ],
          highlight: 'NO vendemos su informacion personal a terceros.',
        },
        {
          heading: '4. Sus Derechos',
          paragraphs: ['Usted tiene derecho a:'],
          list: [
            'Acceder a sus datos (Configuracion → Descargar mis datos)',
            'Actualizar su informacion (Configuracion → Editar perfil)',
            'Eliminar su cuenta (Configuracion → Eliminar cuenta)',
            'Optar por no recibir comunicaciones promocionales',
            'Solicitar una copia de sus datos',
          ],
        },
        {
          heading: '5. Retencion de Datos',
          paragraphs: [
            'Conservamos sus datos mientras su cuenta este activa. Despues de eliminar su cuenta, retenemos los datos durante 30 dias para fines de recuperacion y luego los eliminamos permanentemente. Algunos datos pueden retenerse por mas tiempo si la ley lo requiere.',
          ],
        },
        {
          heading: '6. Seguridad',
          paragraphs: [
            'Protegemos sus datos utilizando medidas de seguridad estandar de la industria que incluyen:',
            'Sin embargo, ningun sistema es 100% seguro. No podemos garantizar seguridad absoluta.',
          ],
          list: [
            'Cifrado HTTPS para toda la transmision de datos',
            'Autenticacion segura y hash de contrasenas',
            'Auditorias y actualizaciones de seguridad regulares',
            'Acceso restringido a datos personales',
          ],
        },
        {
          heading: '7. Privacidad de Menores',
          paragraphs: [
            'Tribe no esta destinado a usuarios menores de 18 anos. No recopilamos intencionalmente informacion de menores de 18 anos. Si descubrimos que hemos recopilado dicha informacion, la eliminaremos de inmediato.',
          ],
        },
        {
          heading: '8. Cambios a esta Politica',
          paragraphs: [
            'Podemos actualizar esta Politica de Privacidad de vez en cuando. Le notificaremos sobre cambios significativos por correo electronico o notificacion en la aplicacion.',
          ],
        },
        {
          heading: '9. Contactenos',
          paragraphs: [],
          contact: true,
          contactLabel: 'Preguntas o solicitudes sobre privacidad:',
        },
      ],
    };
  }

  return {
    title: 'Privacy Policy',
    lastUpdated: 'Last Updated: November 24, 2025',
    businessName: 'Business Name: A Plus Fitness LLC',
    sections: [
      {
        heading: '1. Information We Collect',
        paragraphs: ['We collect information you provide directly:'],
        list: [
          'Account information: name, email, date of birth, phone (optional)',
          'Profile information: photos, bio, sports, skill levels, location (city)',
          'Usage data: sessions created/joined, messages sent, app activity',
          'Location data: approximate location when you use location features',
        ],
      },
      {
        heading: '2. How We Use Your Information',
        paragraphs: ['We use your information to:'],
        list: [
          'Provide the Tribe service (match you with training partners)',
          'Send notifications about sessions and messages',
          'Improve the platform and user experience',
          'Prevent fraud, abuse, and ensure platform safety',
          'Communicate with you about updates and features',
        ],
      },
      {
        heading: '3. Information Sharing',
        paragraphs: ['We share your information with:'],
        list: [
          '<strong>Other users:</strong> Profile information (name, photo, bio, sports, location) is visible to other users',
          '<strong>Service providers:</strong> Hosting (Vercel), database (Supabase), analytics (PostHog)',
          '<strong>Legal requirements:</strong> When required by law or to protect rights and safety',
        ],
        highlight: 'We DO NOT sell your personal information to third parties.',
      },
      {
        heading: '4. Your Rights',
        paragraphs: ['You have the right to:'],
        list: [
          'Access your data (Settings → Download My Data)',
          'Update your information (Settings → Edit Profile)',
          'Delete your account (Settings → Delete Account)',
          'Opt out of promotional communications',
          'Request a copy of your data',
        ],
      },
      {
        heading: '5. Data Retention',
        paragraphs: [
          'We keep your data while your account is active. After you delete your account, we retain data for 30 days for recovery purposes, then permanently delete it. Some data may be retained longer if required by law.',
        ],
      },
      {
        heading: '6. Security',
        paragraphs: [
          'We protect your data using industry-standard security measures including:',
          'However, no system is 100% secure. We cannot guarantee absolute security.',
        ],
        list: [
          'HTTPS encryption for all data transmission',
          'Secure authentication and password hashing',
          'Regular security audits and updates',
          'Restricted access to personal data',
        ],
      },
      {
        heading: "7. Children's Privacy",
        paragraphs: [
          'Tribe is not intended for users under 18. We do not knowingly collect information from children under 18. If we learn we have collected such information, we will delete it immediately.',
        ],
      },
      {
        heading: '8. Changes to This Policy',
        paragraphs: [
          'We may update this Privacy Policy from time to time. We will notify you of significant changes via email or in-app notification.',
        ],
      },
      {
        heading: '9. Contact Us',
        paragraphs: [],
        contact: true,
        contactLabel: 'Privacy questions or requests:',
      },
    ],
  };
}

interface SafetyContent {
  title: string;
  warningTitle: string;
  warningDesc: string;
  checklistSections: Array<{ heading: string; items: string[] }>;
  redFlagsTitle: string;
  redFlags: string[];
  reportingTitle: string;
  reportingDesc: string;
  reportingSteps: string[];
  emergencyTitle: string;
  emergencyDesc: string;
  rememberLabel: string;
  rememberText: string;
}

export function getSafetyContent(language: 'en' | 'es'): SafetyContent {
  if (language === 'es') {
    return {
      title: 'Guia de Seguridad',
      warningTitle: '⚠️ Tu Seguridad es tu Responsabilidad',
      warningDesc:
        'Tribe conecta personas pero no puede verificar identidades ni supervisar sesiones. Sigue estas recomendaciones para mantenerte seguro.',
      checklistSections: [
        {
          heading: 'Antes de la Sesion',
          items: [
            'Revisa los perfiles, calificaciones y actividad de los atletas',
            'Elige lugares de encuentro publicos y bien iluminados (parques, gimnasios, instalaciones deportivas)',
            'Informa a alguien a donde vas, con quien te reuniras y cuando volveras',
            'Confia en tu instinto — si algo se siente mal, no vayas',
            'Revisa los detalles de la sesion y confirma la hora y el lugar con el anfitrion',
          ],
        },
        {
          heading: 'Durante la Sesion',
          items: [
            'Reunete en espacios publicos donde haya otras personas presentes',
            'Manten tu telefono cargado y accesible',
            'Permanece en areas bien iluminadas y con gente',
            'Escucha a tu cuerpo y no te excedas de tus limites',
            'Si te sientes inseguro en algun momento, vete de inmediato',
          ],
        },
        {
          heading: 'Despues de la Sesion',
          items: [
            'Marca la sesion como completada en la aplicacion',
            'Deja una calificacion y resena honesta para ayudar a otros usuarios',
            'Reporta cualquier comportamiento preocupante de inmediato',
          ],
        },
      ],
      redFlagsTitle: '🚩 Senales de Alerta — Ten Cuidado Si Alguien:',
      redFlags: [
        'Te presiona para reunirse en lugares privados o aislados',
        'Envia mensajes inapropiados o incomodos',
        'No tiene foto de perfil o tiene informacion muy limitada',
        'Se comporta de manera agresiva, amenazante o irrespetuosa',
        'Solicita informacion personal (direccion, datos financieros, etc.)',
        'Cancela o reprograma repetidamente a ultima hora',
      ],
      reportingTitle: 'Reportar Problemas',
      reportingDesc: 'Si experimentas acoso, comportamiento inapropiado o preocupaciones de seguridad:',
      reportingSteps: [
        'Sal de la situacion inmediatamente si te sientes inseguro',
        'Bloquea y reporta al usuario en la aplicacion',
        'Contacta a las autoridades locales si estas en peligro inmediato',
        'Enviasnos un correo con los detalles:',
      ],
      emergencyTitle: '🚨 En una Emergencia',
      emergencyDesc: 'Llama a los servicios de emergencia locales de inmediato:',
      rememberLabel: 'Recuerda:',
      rememberText:
        'La mayoria de los usuarios de Tribe son personas genuinas que buscan companeros de entrenamiento. Siguiendo estas recomendaciones y confiando en tu instinto, puedes disfrutar de sesiones de entrenamiento seguras y productivas.',
    };
  }

  return {
    title: 'Safety Guidelines',
    warningTitle: '⚠️ Your Safety is Your Responsibility',
    warningDesc:
      'Tribe connects people but cannot verify identities or supervise sessions. Follow these guidelines to stay safe.',
    checklistSections: [
      {
        heading: 'Before the Session',
        items: [
          'Check athlete profiles, ratings, and past activity',
          'Choose public, well-lit meeting locations (parks, gyms, sports facilities)',
          "Tell someone where you're going, who you're meeting, and when you'll be back",
          "Trust your instincts - if something feels off, don't go",
          'Review the session details and confirm the time/location with the host',
        ],
      },
      {
        heading: 'During the Session',
        items: [
          'Meet in public spaces where other people are present',
          'Keep your phone charged and accessible',
          'Stay in well-lit, populated areas',
          "Listen to your body and don't push beyond your limits",
          'If you feel unsafe at any point, leave immediately',
        ],
      },
      {
        heading: 'After the Session',
        items: [
          'Mark the session as complete in the app',
          'Leave an honest rating and review to help other users',
          'Report any concerning behavior immediately',
        ],
      },
    ],
    redFlagsTitle: '🚩 Red Flags - Be Cautious If Someone:',
    redFlags: [
      'Pressures you to meet in private or isolated locations',
      'Sends inappropriate or uncomfortable messages',
      'Has no profile photo or very limited information',
      'Behaves aggressively, threateningly, or disrespectfully',
      'Asks for personal information (address, financial details, etc.)',
      'Cancels or reschedules repeatedly at the last minute',
    ],
    reportingTitle: 'Reporting Issues',
    reportingDesc: 'If you experience harassment, inappropriate behavior, or safety concerns:',
    reportingSteps: [
      'Leave the situation immediately if you feel unsafe',
      'Block and report the user in the app',
      "Contact local authorities if you're in immediate danger",
      'Email us with details:',
    ],
    emergencyTitle: '🚨 In an Emergency',
    emergencyDesc: 'Call local emergency services immediately:',
    rememberLabel: 'Remember:',
    rememberText:
      'Most Tribe users are genuine people looking for training partners. By following these guidelines and trusting your instincts, you can enjoy safe, productive training sessions.',
  };
}
