/**
 * lib/ai/insight-templates.ts
 *
 * Render-time translation layer for community_insights cards.
 *
 * The intelligence engine writes insights to the database at scoring
 * time. If we persisted the human-readable headline + body as
 * English strings, a Spanish coach would land on /os/intelligence
 * and see English copy — defeating the bilingual contract the rest
 * of the app holds to.
 *
 * Fix: persist a *template* in data_payload — { key, args } — and
 * resolve it to a display string at render time using the caller's
 * language. The persisted `headline` / `body` columns keep their
 * English values as a fallback for any insight written before this
 * layer was added (backward compat).
 *
 * Adding a new template:
 *   1. Add a key to InsightTemplateKey
 *   2. Add an entry to TEMPLATES with en + es format strings
 *   3. Use {placeholder} tokens — args is a flat object
 *
 * Why string templates vs. a heavier i18n framework: the surface is
 * narrow (a few headline / body shapes), the arg sets are tiny, and
 * the rendering happens in two places (server-side at generation
 * for the persisted fallback, client-side at display for the live
 * translation). String templates beat dragging in a runtime.
 */

export type InsightLanguage = 'en' | 'es';

export type InsightTemplateKey =
  | 'churn_risk.default.headline'
  | 'churn_risk.default.body'
  | 'churn_risk.no_signals.body';

/** Args bag for a single template render. Flat for simple substitution. */
export interface InsightTemplateArgs {
  [token: string]: string | number;
}

/** Embedded shape that lives inside community_insights.data_payload. */
export interface InsightTemplate {
  key: InsightTemplateKey;
  args: InsightTemplateArgs;
}

/**
 * Signal-name → human label per language. Maps the score breakdown
 * keys to the phrasing we use in the body copy. Mirrors the SIGNAL_HEADLINE
 * map in insight-generator.ts so en stays in sync.
 */
export const SIGNAL_LABEL: Record<string, Record<InsightLanguage, string>> = {
  daysSinceLastAttendance: {
    en: 'days since their last visit',
    es: 'días desde su última visita',
  },
  attendanceFrequencyDelta: {
    en: 'attendance dropping off',
    es: 'asistencia bajando',
  },
  streakBroken: {
    en: 'a streak that just broke',
    es: 'una racha que se rompió',
  },
  communityGraphIsolation: {
    en: 'no training partners',
    es: 'sin compañeros de entrenamiento',
  },
  paymentFailures: {
    en: 'failed payments',
    es: 'pagos fallidos',
  },
  cancellationRate: {
    en: 'a high cancellation rate',
    es: 'una alta tasa de cancelación',
  },
  communityEngagementDrop: {
    en: 'a drop in community engagement',
    es: 'una caída en la participación',
  },
};

/**
 * Format strings by template key and language. Tokens are
 * `{name}`-style and replaced verbatim — they're not Intl.NumberFormat-aware,
 * so callers pre-format numerics (scores rounded to 2 decimals, etc.)
 * before passing them as args.
 */
const TEMPLATES: Record<InsightTemplateKey, Record<InsightLanguage, string>> = {
  'churn_risk.default.headline': {
    en: '{name} is at risk of churning',
    es: '{name} está en riesgo de abandonar',
  },
  'churn_risk.default.body': {
    en: 'Score {score}. Largest driver: {topSignal} ({topValue} of the total). A short check-in message often pulls them back.',
    es: 'Puntuación {score}. Principal factor: {topSignal} ({topValue} del total). Un mensaje breve suele recuperarlos.',
  },
  'churn_risk.no_signals.body': {
    en: 'Churn risk crossed the threshold (score {score}). Reach out to keep them engaged.',
    es: 'El riesgo de abandono cruzó el umbral (puntuación {score}). Contáctalos para mantenerlos comprometidos.',
  },
};

/**
 * Substitute `{token}` placeholders in `format` with values from `args`.
 * Unknown tokens are left in place (defensive — better to render a
 * literal "{foo}" than silently drop it and ship broken-looking copy).
 */
function substitute(format: string, args: InsightTemplateArgs): string {
  return format.replace(/\{(\w+)\}/g, (_match, token) => {
    const value = args[token];
    if (value === undefined || value === null) return `{${token}}`;
    return String(value);
  });
}

/**
 * Resolve a template to a display string in the requested language.
 * Falls back to English when the requested language doesn't have a
 * translation for the key (shouldn't happen in practice; the
 * TEMPLATES table is dense).
 *
 * Args go through a localization pass first: any arg whose VALUE
 * matches a SIGNAL_LABEL key gets swapped for its localized label.
 * That way the generator can write `args.topSignal = "attendanceFrequencyDelta"`
 * (the canonical key) and trust the renderer to produce
 * "attendance dropping off" in en or "asistencia bajando" in es.
 */
export function renderTemplate(template: InsightTemplate, language: InsightLanguage): string {
  const formats = TEMPLATES[template.key];
  if (!formats) return ''; // unknown key — caller should fall back to persisted headline
  const format = formats[language] ?? formats.en;
  return substitute(format, localizeArgs(template.args, language));
}

/**
 * One-pass arg transformation: replace any string-valued arg that
 * happens to be a SIGNAL_LABEL key with the localized label for the
 * requested language. Non-signal args (names, numbers) pass through
 * untouched. Cheap (O(n) over args, single hash lookup each).
 */
function localizeArgs(args: InsightTemplateArgs, language: InsightLanguage): InsightTemplateArgs {
  const out: InsightTemplateArgs = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && SIGNAL_LABEL[v]) {
      out[k] = SIGNAL_LABEL[v][language] ?? v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Look at an arbitrary data_payload and pull out an InsightTemplate
 * if one is embedded. Returns null when the payload predates this
 * layer or doesn't carry a template (caller falls back to the
 * persisted headline/body fields).
 */
export function extractTemplate(payload: unknown, slot: 'headline' | 'body'): InsightTemplate | null {
  if (!payload || typeof payload !== 'object') return null;
  const bag = (payload as Record<string, unknown>).template;
  if (!bag || typeof bag !== 'object') return null;
  const slotValue = (bag as Record<string, unknown>)[slot];
  if (!slotValue || typeof slotValue !== 'object') return null;
  const candidate = slotValue as Record<string, unknown>;
  if (typeof candidate.key !== 'string') return null;
  const args = candidate.args;
  if (!args || typeof args !== 'object') return null;
  return {
    key: candidate.key as InsightTemplateKey,
    args: args as InsightTemplateArgs,
  };
}
