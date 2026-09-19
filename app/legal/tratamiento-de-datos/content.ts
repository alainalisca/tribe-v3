/**
 * Política de Tratamiento de Datos Personales, version 1.0, effective
 * 2026-09-18. The approved legal text, in its own module.
 *
 * GENERATED FROM THE APPROVED SOURCE, NOT TYPED. T-LEGAL1 shipped the text as
 * T-LEGAL1_policy.json and this file was produced from it by a one-off script
 * that was then deleted. The rendered DOM was diffed against that JSON,
 * paragraph for paragraph, in both languages, and the diff was empty. Hand
 * editing this file breaks that guarantee: the accent guard on main will catch
 * a dropped accent, but nothing in the repository will catch a dropped
 * sentence.
 *
 * SPANISH GOVERNS. The English text is a courtesy translation and says so in
 * its own intro line. If the two ever disagree, the Spanish one is the policy.
 *
 * It lives here rather than in legalTranslations.ts because it is roughly ten
 * times the size of everything else in that file, and because it is a legal
 * instrument with a version and an effective date rather than UI copy. The
 * es: and en: keys are deliberate: that is the shape the Spanish accent guard
 * scans, so this text is covered by it like any other Spanish string.
 *
 * The version line is part of the approved text and is NOT computed from a
 * date function. A policy that silently restates its own effective date is
 * evidence of nothing.
 */

/** A paragraph, or a bullet list. The source interleaves them inside a section. */
export type PolicyBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

export interface PolicySection {
  /** Carries its own number, e.g. "1. Quién es el responsable del tratamiento". */
  heading: string;
  blocks: PolicyBlock[];
}

export interface PolicyContent {
  /** The h1. */
  title: string;
  /** Brand line, legal basis line, version line. Rendered above the first section. */
  intro: string[];
  sections: PolicySection[];
}

export const DATA_POLICY: Record<'en' | 'es', PolicyContent> = {
  es: {
    title: 'Política de Tratamiento de Datos Personales',
    intro: [
      'Tribe · Nunca Entrenes Solo',
      'Ley 1581 de 2012, Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y demás normas que las modifiquen o complementen.',
      'Versión 1.0 · Vigente desde el 18 de septiembre de 2026',
    ],
    sections: [
      {
        heading: '1. Quién es el responsable del tratamiento',
        blocks: [
          {
            kind: 'p',
            text: 'El responsable del tratamiento de los datos personales recogidos a través de la aplicación y el sitio web Tribe (en adelante, "Tribe") es A Plus Fitness LLC, sociedad constituida en el estado de Nueva York, Estados Unidos de América, que opera Tribe (en adelante, "nosotros"). Canal de contacto para todo lo relacionado con datos personales: tribe@aplusfitnessllc.com, asunto "Datos personales".',
          },
        ],
      },
      {
        heading: '2. A quién aplica esta política',
        blocks: [
          {
            kind: 'p',
            text: 'Aplica a toda persona natural que use Tribe, cree una cuenta, reserve o publique una sesión, reclame un pase digital o se comunique con nosotros (en adelante, "el titular"). Tribe está dirigida a personas mayores de dieciocho (18) años. No recogemos a sabiendas datos de menores de edad; si un padre, madre o representante legal nos informa que un menor nos entregó datos, los eliminaremos.',
          },
        ],
      },
      {
        heading: '3. Qué datos recogemos',
        blocks: [
          { kind: 'p', text: 'Recogemos únicamente los datos necesarios para prestar el servicio:' },
          {
            kind: 'ul',
            items: [
              'Datos de cuenta: nombre, correo electrónico, número de teléfono o WhatsApp, fotografía de perfil (opcional), ciudad o zona aproximada, disciplinas de interés y, para instructores, información profesional que el propio instructor decide publicar.',
              'Datos del pase digital: nombre, número de WhatsApp, correo electrónico, preferencias de clase (por ejemplo tipo y horario), el aliado ante el cual se reclama el pase, el código de la campaña o material impreso de origen, y la fecha, hora y texto de la autorización otorgada.',
              'Datos de uso: sesiones creadas, reservadas o a las que se asistió, comunidades a las que pertenece, mensajes enviados dentro de la aplicación.',
              'Datos técnicos: dirección IP, tipo de dispositivo y navegador, identificadores del dispositivo necesarios para notificaciones, registros de acceso y de errores.',
              'Pagos: cuando existan sesiones de pago, el cobro lo procesa un tercero especializado. Tribe no almacena números de tarjeta ni credenciales bancarias.',
            ],
          },
          {
            kind: 'p',
            text: 'No solicitamos datos sensibles (salud, origen étnico, orientación sexual, creencias, datos biométricos). Si un titular decide incluir información de ese tipo en un campo de texto libre, lo hace de manera voluntaria y puede eliminarla en cualquier momento.',
          },
        ],
      },
      {
        heading: '4. Para qué usamos los datos',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Operar Tribe: crear y administrar la cuenta, mostrar instructores, gimnasios y sesiones, y permitir reservas y asistencia.',
              'Conectar al titular con instructores, gimnasios y estudios aliados, incluido el envío de sus datos de contacto al aliado que el titular escoja al reclamar un pase digital, para que ese aliado lo contacte y agende su clase.',
              'Enviar comunicaciones transaccionales: confirmaciones, recordatorios, pases, avisos de seguridad y cambios en el servicio.',
              'Enviar comunicaciones comerciales de Tribe sobre nuevas sesiones, instructores, aliados y novedades. El titular puede dejar de recibirlas en cualquier momento a través del enlace incluido en cada mensaje o escribiéndonos.',
              'Prevenir fraude y abuso, proteger la seguridad de la plataforma y de sus usuarios, y cumplir obligaciones legales.',
              'Medir el funcionamiento del servicio y de nuestras campañas (por ejemplo, cuántas personas llegaron desde un material impreso), con datos agregados siempre que sea posible.',
            ],
          },
        ],
      },
      {
        heading: '5. Con quién compartimos los datos',
        blocks: [
          {
            kind: 'p',
            text: 'Aliados (instructores, gimnasios y estudios). Cuando el titular reclama un pase digital o reserva una sesión, compartimos con el aliado correspondiente los datos necesarios para que lo contacte y preste la clase: nombre, número de WhatsApp, correo electrónico y preferencias indicadas. El titular autoriza expresamente esta transmisión al marcar la casilla de consentimiento del pase o al reservar. Cada aliado es responsable independiente del uso que haga de esos datos a partir de ese momento, dentro del propósito autorizado. Tribe exige a sus aliados usar los datos únicamente para contactar al titular sobre la clase solicitada.',
          },
          {
            kind: 'p',
            text: 'Encargados del tratamiento. Usamos proveedores que tratan datos por cuenta nuestra y bajo nuestras instrucciones: alojamiento y base de datos (Supabase, Inc., Estados Unidos), alojamiento de la aplicación web (Vercel, Inc., Estados Unidos), envío de correo transaccional (Resend, Inc., Estados Unidos), tiendas de aplicaciones (Apple y Google) y, cuando el titular usa un botón de WhatsApp, WhatsApp LLC (Meta). Estos proveedores no pueden usar los datos para fines propios.',
          },
          {
            kind: 'p',
            text: 'Autoridades. Compartiremos datos cuando una ley, una orden judicial o una autoridad competente lo exija.',
          },
          { kind: 'p', text: 'Tribe no vende datos personales ni los cede a terceros para publicidad de terceros.' },
        ],
      },
      {
        heading: '6. Transferencia internacional de datos',
        blocks: [
          {
            kind: 'p',
            text: 'Los datos se almacenan y procesan en servidores ubicados en Estados Unidos de América, a través de los encargados mencionados en la sección 5. Al aceptar esta política y otorgar su autorización, el titular consiente de manera expresa e inequívoca la transferencia y transmisión internacional de sus datos personales a ese país para las finalidades aquí descritas. Adoptamos medidas contractuales y técnicas para que los datos reciban un nivel de protección adecuado en el destino.',
          },
        ],
      },
      {
        heading: '7. Derechos del titular',
        blocks: [
          { kind: 'p', text: 'De acuerdo con el artículo 8 de la Ley 1581 de 2012, el titular tiene derecho a:' },
          {
            kind: 'ul',
            items: [
              'Conocer, actualizar y rectificar sus datos personales.',
              'Solicitar prueba de la autorización otorgada, salvo cuando la ley no la exija.',
              'Ser informado, previa solicitud, sobre el uso que se ha dado a sus datos.',
              'Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley.',
              'Revocar la autorización y solicitar la supresión de sus datos cuando no exista un deber legal o contractual que obligue a conservarlos.',
              'Acceder de forma gratuita a sus datos personales.',
            ],
          },
          {
            kind: 'p',
            text: 'El titular puede ejercer estos derechos por sí mismo, por medio de sus causahabientes, de un representante o apoderado, o por estipulación a favor de otro.',
          },
        ],
      },
      {
        heading: '8. Cómo ejercer los derechos: consultas y reclamos',
        blocks: [
          {
            kind: 'p',
            text: 'Canal: tribe@aplusfitnessllc.com con el asunto "Datos personales", o desde la aplicación en la opción de eliminar cuenta. La solicitud debe indicar el nombre del titular, el correo o número de WhatsApp registrado, la descripción de lo que se solicita y, si aplica, los documentos que la sustenten.',
          },
          {
            kind: 'p',
            text: 'Consultas. Las atenderemos en un término máximo de diez (10) días hábiles contados desde la fecha de recibo. Si no es posible en ese plazo, informaremos los motivos y la fecha en que se atenderá, que no superará los cinco (5) días hábiles siguientes al vencimiento del primer término.',
          },
          {
            kind: 'p',
            text: 'Reclamos. Si el titular considera que sus datos deben ser corregidos, actualizados o suprimidos, o que se ha incumplido la ley, puede presentar un reclamo. Si está incompleto, requeriremos al interesado dentro de los cinco (5) días siguientes para que lo complete; transcurridos dos (2) meses sin respuesta, se entenderá desistido. Una vez recibido el reclamo completo, incluiremos en la base de datos la leyenda "reclamo en trámite" y lo resolveremos en un término máximo de quince (15) días hábiles, prorrogable por ocho (8) días hábiles adicionales, informando los motivos de la demora.',
          },
          {
            kind: 'p',
            text: 'El titular solo podrá elevar queja ante la Superintendencia de Industria y Comercio una vez haya agotado el trámite de consulta o reclamo ante Tribe.',
          },
        ],
      },
      {
        heading: '9. Cómo se otorga y se conserva la autorización',
        blocks: [
          {
            kind: 'p',
            text: 'La autorización se otorga al crear la cuenta, al reservar una sesión, al marcar la casilla de consentimiento en un pase digital, o por cualquier conducta inequívoca que permita concluir razonablemente que el titular la otorgó. Tribe conserva prueba de la autorización: el texto exacto que el titular aceptó, la fecha y hora, y el medio por el cual la otorgó.',
          },
        ],
      },
      {
        heading: '10. Seguridad',
        blocks: [
          {
            kind: 'p',
            text: 'Aplicamos medidas técnicas, humanas y administrativas razonables para evitar la adulteración, pérdida, consulta, uso o acceso no autorizado o fraudulento de los datos: cifrado en tránsito, control de acceso por roles y a nivel de fila en la base de datos, principio de mínimo privilegio, registro de accesos y revisión periódica. Ningún sistema es infalible; si ocurre un incidente que afecte datos personales, informaremos a los titulares afectados y a la autoridad cuando la ley lo exija.',
          },
        ],
      },
      {
        heading: '11. Conservación de los datos',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Datos de cuenta: mientras la cuenta esté activa y hasta doce (12) meses después de su eliminación, salvo obligación legal de conservarlos por más tiempo.',
              'Datos de pases digitales: hasta veinticuatro (24) meses desde su creación, o antes si el titular solicita la supresión.',
              'Registros técnicos y de seguridad: hasta doce (12) meses.',
              'Prueba de la autorización: durante toda la vigencia del tratamiento y el tiempo adicional que exija la ley para acreditar su existencia.',
            ],
          },
        ],
      },
      {
        heading: '12. Almacenamiento local y cookies',
        blocks: [
          {
            kind: 'p',
            text: 'Tribe usa almacenamiento local del dispositivo o navegador para mantener la sesión iniciada, recordar preferencias y evitar envíos duplicados de un formulario. No usamos cookies de publicidad de terceros.',
          },
        ],
      },
      {
        heading: '13. Cambios a esta política',
        blocks: [
          {
            kind: 'p',
            text: 'Podemos actualizar esta política. Publicaremos la versión vigente en tribe-v3.vercel.app/legal/tratamiento-de-datos con su fecha de entrada en vigor y, cuando el cambio sea sustancial, lo comunicaremos por los canales habituales antes de que aplique.',
          },
        ],
      },
      {
        heading: '14. Contacto',
        blocks: [
          { kind: 'p', text: 'A Plus Fitness LLC (Tribe) · tribe@aplusfitnessllc.com · Asunto: Datos personales' },
        ],
      },
    ],
  },
  en: {
    title: 'Personal Data Processing Policy',
    intro: [
      'Tribe · Never Train Alone',
      'Colombian Law 1581 of 2012, Decree 1377 of 2013 (compiled in Decree 1074 of 2015) and any rules that amend or supplement them. This English version is provided for convenience; the Spanish version governs.',
      'Version 1.0 · Effective September 18, 2026',
    ],
    sections: [
      {
        heading: '1. Who is responsible for processing',
        blocks: [
          {
            kind: 'p',
            text: 'The controller of the personal data collected through the Tribe app and website ("Tribe") is A Plus Fitness LLC, a company organized under the laws of the State of New York, United States of America, which operates Tribe ("we"). Contact for anything related to personal data: tribe@aplusfitnessllc.com, subject "Personal data".',
          },
        ],
      },
      {
        heading: '2. Who this policy applies to',
        blocks: [
          {
            kind: 'p',
            text: 'It applies to every natural person who uses Tribe, creates an account, books or publishes a session, claims a digital pass or contacts us (the "data subject"). Tribe is intended for people aged eighteen (18) or older. We do not knowingly collect data from minors; if a parent or legal guardian informs us that a minor has given us data, we will delete it.',
          },
        ],
      },
      {
        heading: '3. What data we collect',
        blocks: [
          { kind: 'p', text: 'We collect only the data needed to provide the service:' },
          {
            kind: 'ul',
            items: [
              'Account data: name, email address, phone or WhatsApp number, profile photo (optional), city or approximate area, disciplines of interest and, for instructors, the professional information the instructor chooses to publish.',
              'Digital pass data: name, WhatsApp number, email address, class preferences (for example type and time of day), the partner the pass is claimed with, the campaign or printed-material code of origin, and the date, time and text of the consent given.',
              'Usage data: sessions created, booked or attended, communities joined, messages sent inside the app.',
              'Technical data: IP address, device and browser type, device identifiers needed for notifications, access and error logs.',
              'Payments: where paid sessions exist, payment is processed by a specialized third party. Tribe does not store card numbers or banking credentials.',
            ],
          },
          {
            kind: 'p',
            text: 'We do not request sensitive data (health, ethnic origin, sexual orientation, beliefs, biometric data). If a data subject chooses to include such information in a free-text field, they do so voluntarily and may remove it at any time.',
          },
        ],
      },
      {
        heading: '4. What we use the data for',
        blocks: [
          {
            kind: 'ul',
            items: [
              'To operate Tribe: create and manage the account, display instructors, gyms and sessions, and allow bookings and attendance.',
              'To connect the data subject with partner instructors, gyms and studios, including sending their contact details to the partner they choose when claiming a digital pass, so that partner can contact them and schedule their class.',
              'To send transactional communications: confirmations, reminders, passes, security notices and service changes.',
              'To send Tribe marketing communications about new sessions, instructors, partners and news. The data subject may opt out at any time via the link in each message or by writing to us.',
              'To prevent fraud and abuse, protect the security of the platform and its users, and comply with legal obligations.',
              'To measure how the service and our campaigns perform (for example, how many people arrived from a printed material), using aggregated data wherever possible.',
            ],
          },
        ],
      },
      {
        heading: '5. Who we share data with',
        blocks: [
          {
            kind: 'p',
            text: 'Partners (instructors, gyms and studios). When the data subject claims a digital pass or books a session, we share with the corresponding partner the data needed to contact them and deliver the class: name, WhatsApp number, email address and stated preferences. The data subject expressly authorizes this transmission by ticking the consent box on the pass or by booking. Each partner is an independent controller of its use of that data from that point on, within the authorized purpose. Tribe requires its partners to use the data only to contact the data subject about the requested class.',
          },
          {
            kind: 'p',
            text: 'Processors. We use providers that process data on our behalf and under our instructions: hosting and database (Supabase, Inc., United States), web application hosting (Vercel, Inc., United States), transactional email (Resend, Inc., United States), app stores (Apple and Google) and, when the data subject uses a WhatsApp button, WhatsApp LLC (Meta). These providers may not use the data for their own purposes.',
          },
          {
            kind: 'p',
            text: 'Authorities. We will share data where a law, court order or competent authority requires it.',
          },
          {
            kind: 'p',
            text: 'Tribe does not sell personal data and does not hand it to third parties for third-party advertising.',
          },
        ],
      },
      {
        heading: '6. International data transfer',
        blocks: [
          {
            kind: 'p',
            text: 'Data is stored and processed on servers located in the United States of America through the processors listed in section 5. By accepting this policy and giving consent, the data subject expressly and unequivocally consents to the international transfer and transmission of their personal data to that country for the purposes described here. We adopt contractual and technical measures so the data receives an adequate level of protection at its destination.',
          },
        ],
      },
      {
        heading: '7. Rights of the data subject',
        blocks: [
          { kind: 'p', text: 'Under article 8 of Law 1581 of 2012, the data subject has the right to:' },
          {
            kind: 'ul',
            items: [
              'Know, update and rectify their personal data.',
              'Request proof of the consent given, except where the law does not require it.',
              'Be informed, upon request, of the use that has been made of their data.',
              'File complaints with the Superintendencia de Industria y Comercio for breaches of the law.',
              'Revoke consent and request deletion of their data where no legal or contractual duty requires keeping it.',
              'Access their personal data free of charge.',
            ],
          },
          {
            kind: 'p',
            text: 'The data subject may exercise these rights personally, through their successors, through a representative or attorney-in-fact, or by stipulation in favor of another.',
          },
        ],
      },
      {
        heading: '8. How to exercise these rights: inquiries and claims',
        blocks: [
          {
            kind: 'p',
            text: 'Channel: tribe@aplusfitnessllc.com with the subject "Personal data", or from the app via the delete account option. The request must state the data subject\'s name, the registered email or WhatsApp number, a description of what is requested and, where applicable, supporting documents.',
          },
          {
            kind: 'p',
            text: 'Inquiries. We will answer within a maximum of ten (10) business days from receipt. If that is not possible, we will explain why and state the date on which the inquiry will be answered, which will not exceed five (5) business days after the first term expires.',
          },
          {
            kind: 'p',
            text: 'Claims. If the data subject believes their data should be corrected, updated or deleted, or that the law has been breached, they may file a claim. If it is incomplete, we will ask the claimant within five (5) days to complete it; after two (2) months without a response, the claim is deemed withdrawn. Once a complete claim is received, we will mark the record "claim in progress" and resolve it within a maximum of fifteen (15) business days, extendable by eight (8) additional business days with an explanation of the delay.',
          },
          {
            kind: 'p',
            text: 'The data subject may only file a complaint with the Superintendencia de Industria y Comercio after exhausting the inquiry or claim process with Tribe.',
          },
        ],
      },
      {
        heading: '9. How consent is given and kept',
        blocks: [
          {
            kind: 'p',
            text: 'Consent is given when creating the account, booking a session, ticking the consent box on a digital pass, or through any unequivocal conduct that reasonably shows the data subject gave it. Tribe keeps proof of consent: the exact text the data subject accepted, the date and time, and the channel used.',
          },
        ],
      },
      {
        heading: '10. Security',
        blocks: [
          {
            kind: 'p',
            text: 'We apply reasonable technical, human and administrative measures to prevent alteration, loss, unauthorized or fraudulent access to or use of the data: encryption in transit, role-based and row-level access control in the database, least privilege, access logging and periodic review. No system is infallible; if an incident affecting personal data occurs, we will inform the affected data subjects and the authority where the law requires it.',
          },
        ],
      },
      {
        heading: '11. Data retention',
        blocks: [
          {
            kind: 'ul',
            items: [
              'Account data: while the account is active and up to twelve (12) months after deletion, unless a legal obligation requires longer retention.',
              'Digital pass data: up to twenty-four (24) months from creation, or earlier if the data subject requests deletion.',
              'Technical and security logs: up to twelve (12) months.',
              'Proof of consent: for the duration of processing and any additional period the law requires to evidence it.',
            ],
          },
        ],
      },
      {
        heading: '12. Local storage and cookies',
        blocks: [
          {
            kind: 'p',
            text: 'Tribe uses device or browser local storage to keep you signed in, remember preferences and avoid duplicate form submissions. We do not use third-party advertising cookies.',
          },
        ],
      },
      {
        heading: '13. Changes to this policy',
        blocks: [
          {
            kind: 'p',
            text: 'We may update this policy. We will publish the current version at tribe-v3.vercel.app/legal/tratamiento-de-datos with its effective date and, where the change is material, communicate it through the usual channels before it applies.',
          },
        ],
      },
      {
        heading: '14. Contact',
        blocks: [
          { kind: 'p', text: 'A Plus Fitness LLC (Tribe) · tribe@aplusfitnessllc.com · Subject: Personal data' },
        ],
      },
    ],
  },
};
