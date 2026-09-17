/**
 * The shared word list behind the Spanish-accent guard.
 *
 * Exported as data rather than inlined in the test so the dev-mode warning and
 * any future tooling read the SAME list. Two lists that drift apart is how the
 * 2026-09-14 report came to be "fixed" while half the defect shipped on.
 */

/**
 * Words that require an accent in EVERY context, with no English homograph.
 *
 * Seeded on 2026-09-17 from the strings actually found unaccented in this
 * repository, not from a dictionary. Add to it when a new one is found.
 */
export const REQUIRES_ACCENT: Readonly<Record<string, string>> = {
  anos: 'años',
  informacion: 'información',
  jurisdiccion: 'jurisdicción',
  mayoria: 'mayoría',
  ubicacion: 'ubicación',
  sesion: 'sesión',
  anfitrion: 'anfitrión',
  calificacion: 'calificación',
  resenas: 'reseñas',
  resena: 'reseña',
  politica: 'política',
  terminos: 'términos',
  pagina: 'página',
  telefono: 'teléfono',
  codigo: 'código',
  categoria: 'categoría',
  descripcion: 'descripción',
  duracion: 'duración',
  configuracion: 'configuración',
  direccion: 'dirección',
  proximo: 'próximo',
  proxima: 'próxima',
  proximos: 'próximos',
  proximas: 'próximas',
  numero: 'número',
  metodo: 'método',
  titulo: 'título',
  maximo: 'máximo',
  minimo: 'mínimo',
  espanol: 'español',
  manana: 'mañana',
  companeros: 'compañeros',
  companero: 'compañero',
  contrasena: 'contraseña',
  diseno: 'diseño',
  natacion: 'natación',
  musica: 'música',
  credito: 'crédito',
  creditos: 'créditos',
  basico: 'básico',
  boton: 'botón',
  corazon: 'corazón',
  estadisticas: 'estadísticas',
  analisis: 'análisis',
  aqui: 'aquí',
  atras: 'atrás',
  despues: 'después',
  ademas: 'además',
  tambien: 'también',
  rapido: 'rápido',
  facil: 'fácil',
  ultimo: 'último',
  ultima: 'última',
  accion: 'acción',
  opcion: 'opción',
  biografia: 'biografía',
  asistio: 'asistió',
  ingles: 'inglés',
  extranan: 'extrañan',
  acompana: 'acompaña',
};

/**
 * DELIBERATELY ABSENT, and they must stay absent.
 *
 * `este` and `solo` are CORRECT without an accent. The Real Academia Española
 * removed those accents in its 2010 Ortografía -- `éste` as a demonstrative
 * pronoun and `sólo` as an adverb are no longer written with one. Adding them
 * here would make this guard demand a change that is wrong, on 23 strings.
 *
 * Also absent, because the accent depends on meaning and only a Spanish speaker
 * can rule: cuando/cómo/qué/dónde/cuál/quién (interrogative or not), aun vs aún
 * ("even" vs "still"), sera, veras, esta, tu, Unete. Those 51 strings are with
 * Ana; when she rules, the unambiguous ones move into REQUIRES_ACCENT above.
 *
 * `futbol` is absent for a different reason: app/api/events/eventbrite/route.ts
 * matches third-party event titles on BOTH spellings on purpose, so the guard
 * must not demand the accented form there.
 */
export const DELIBERATELY_EXCLUDED = [
  'este',
  'solo',
  'cuando',
  'como',
  'que',
  'donde',
  'cual',
  'quien',
  'aun',
  'sera',
  'veras',
  'esta',
  'tu',
  'unete',
  'futbol',
] as const;

/** Matches a whole word, accent-insensitively on the left/right boundaries. */
export function accentWordPattern(word: string): RegExp {
  return new RegExp(`(?<![A-Za-zÁÉÍÓÚÑÜáéíóúñü])${word}(?![A-Za-zÁÉÍÓÚÑÜáéíóúñü])`, 'gi');
}
