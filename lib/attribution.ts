/**
 * T-GROW1 part A. The one place attribution is read off a URL and remembered.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONE MODULE AND NOT A HOOK ON THE PASS PAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Before this, `src` and `code` were read in exactly one place -- PaseForm's
 * mount effect -- and `ref` in exactly one other, /auth. So a person who opened
 * `/?src=runclub&code=RUNCLUB-SAT0927`, browsed the feed, and THEN opened the
 * pass arrived with no parameters and was recorded as having come from nowhere.
 * Measured on production 2026-10-08: 2 of the 3 live pass leads have no src and
 * no code at all.
 *
 * That is the whole bug. Capture has to happen on EVERY route, which means it
 * belongs in the root layout, which means it belongs in a module with no React
 * in it so the same sanitizers can serve the server routes too.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SANITIZERS ARE SHARED WITH THE SERVER ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * /api/pase had its own `sanitizeTag` and its own `MAX_CODE_LEN = 40`. A second
 * copy of a limit is the defect this repo has paid for four times over --
 * SPORTS_LIST in five modules, two translation maps for the same 23 keys, three
 * hand-kept copies of the applied-migration list, three copies of a comment
 * stripper. So the route imports from here now, and migrations 211 and 213 bound
 * the same columns at the same 40 characters.
 *
 * Those two numbers -- this file's and the SQL's -- are the same number, and
 * lib/attribution.limits.test.ts parses the migrations and fails if they ever
 * stop being. That matters more than it looks: the CHECK binds the service role,
 * so a route that let a 41-character tag through would not produce a bad field,
 * it would produce a 23514 and LOSE THE LEAD. Shape is dropped to NULL here
 * where failing soft is right; size is enforced in both places at one value.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY STORAGE ACCESS IS WRAPPED, AND THAT IS A REQUIREMENT NOT A HABIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Safari in private mode throws on localStorage.setItem rather than returning
 * false, and an iOS webview with cookies blocked throws on the GETTER -- reading
 * `window.localStorage` at all can raise before any method is called. The pass
 * form is the most important unauthenticated POST in the product and a stranger
 * is standing in a gym while it runs, so NOTHING here may ever throw into a
 * caller. Every function returns a value that means "no attribution" rather than
 * propagating. The spec's own definition of done includes a storage-blocked
 * browser still submitting leads.
 */

/**
 * 40 characters, and the same 40 as pass_leads_attr_tag_bounds and
 * attribution_events_tag_bounds. See the header: these are one number.
 */
export const ATTR_MAX_LEN = 40;

/** Matches pass_leads_landing_path_bounds and attribution_events_tag_bounds. */
export const ATTR_MAX_PATH_LEN = 200;

export const FIRST_TOUCH_KEY = 'tribe_attr_first';
export const LAST_TOUCH_KEY = 'tribe_attr_last';
/** Where the per-tab dedupe key for /api/attr lives. Not an identifier. */
export const SESSION_KEY_STORAGE = 'tribe_attr_session';

const DAY_MS = 86_400_000;
/** First touch is the long memory: a poster seen in October converting in December. */
export const FIRST_TOUCH_TTL_MS = 90 * DAY_MS;
/** Last touch is the recent cause, and a stale one is worse than none. */
export const LAST_TOUCH_TTL_MS = 30 * DAY_MS;

/**
 * The stored shape, and the shape `first_touch jsonb` holds on a lead row.
 *
 * `ts` is load-bearing rather than decorative: it is both the capture time and
 * the expiry basis, so there is no second timestamp that could disagree with it.
 */
export interface Attribution {
  src: string | null;
  code: string | null;
  ref: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  landing_path: string | null;
  /** Epoch ms. Capture time AND the basis for expiry. */
  ts: number;
}

/** The seven tag fields, in the order the admin table reads them. */
export const ATTR_TAG_FIELDS = [
  'src',
  'code',
  'ref',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
] as const;

export type AttrTagField = (typeof ATTR_TAG_FIELDS)[number];

/**
 * Which fields are lowercased and which are uppercased.
 *
 * `src` and the utm_* are CHANNEL names and arrive from whatever typed the link,
 * so `Instagram`, `instagram` and `INSTAGRAM` have to collapse to one row in the
 * Origen table or one channel reads as three small ones.
 *
 * `code` and `ref` are printed on posters and spoken out loud, so they are
 * uppercased for the opposite reason: `runclub-sat0927` and `RUNCLUB-SAT0927`
 * are the same code, and the one on the poster is the uppercase one.
 */
const UPPERCASE_FIELDS = new Set<AttrTagField>(['code', 'ref']);

/**
 * A tag, or null.
 *
 * NEVER THROWS AND NEVER REJECTS A CALLER. A malformed tag is dropped to null,
 * because the alternative is losing a lead over a typo in a poster's query
 * string, and 173's sanitizeTag settled that trade already.
 *
 * Trailing and leading whitespace goes first: a QR printed with a space before
 * the closing quote is a real thing and it is not the visitor's fault.
 */
export function sanitizeTag(value: unknown, field?: AttrTagField): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > ATTR_MAX_LEN) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  if (field && UPPERCASE_FIELDS.has(field)) return trimmed.toUpperCase();
  return trimmed.toLowerCase();
}

/**
 * The path the visitor landed on, bounded.
 *
 * TRUNCATED RATHER THAN DROPPED, which is the opposite of how a tag is treated,
 * and deliberately: a tag that fails its rule is probably not a tag at all,
 * while a path that is too long is still the right path with its tail missing.
 * "/storefront/<uuid>/" is 48 characters before anything else, so 200 is
 * headroom rather than a limit anybody will meet.
 *
 * The query string is NOT stored. It holds the tags, which are stored as their
 * own columns, and it is also where a token or an email would be if one ever got
 * put in a link -- so the one field that could quietly accumulate secrets does
 * not exist.
 */
export function sanitizeLandingPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const path = value.split('?')[0].split('#')[0].trim();
  if (path === '') return null;
  return path.slice(0, ATTR_MAX_PATH_LEN);
}

/** Did this visit carry any attribution at all? A landing path alone is not a tag. */
export function isTagged(attr: Attribution | null): boolean {
  if (!attr) return false;
  return ATTR_TAG_FIELDS.some((f) => attr[f] !== null);
}

/**
 * Read attribution out of a query string.
 *
 * Takes the search and the path as ARGUMENTS rather than reading `window`, so
 * the whole of this function is testable without a DOM and so the server routes
 * can use it on a URL they were handed.
 */
export function readAttributionFromUrl(search: string, pathname: string, now: number): Attribution {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // URLSearchParams does not throw on malformed input in any engine this ships
    // to, but a caller passing a non-string would. Costs one branch.
    params = new URLSearchParams();
  }
  const read = (field: AttrTagField) => sanitizeTag(params.get(field), field);
  return {
    src: read('src'),
    code: read('code'),
    ref: read('ref'),
    utm_source: read('utm_source'),
    utm_medium: read('utm_medium'),
    utm_campaign: read('utm_campaign'),
    utm_content: read('utm_content'),
    landing_path: sanitizeLandingPath(pathname),
    ts: now,
  };
}

/** Matches pass_leads_first_touch_bounds: jsonb object, 2000 characters. */
export const ATTR_MAX_FIRST_TOUCH_CHARS = 2000;

/**
 * Turn an untrusted object into an Attribution, or null.
 *
 * REVALIDATES EVERY FIELD through the same sanitizers rather than trusting the
 * shape it was handed. Two callers, both of which receive this from somewhere a
 * caller does not control:
 *
 *   * reading localStorage, which is writable by anything running on this origin
 *     -- an extension, or a previous version of this code with different rules;
 *   * /api/pase receiving `first_touch` in a POST body, which is a stranger's
 *     request and could say anything at all.
 *
 * Without this, the length and charset migrations 211 and 213 enforce could be
 * violated by a value that arrived through either door, and the first anyone
 * would hear of it is a 23514 -- which on pass_leads does not lose a field, it
 * LOSES THE LEAD.
 *
 * `ts` IS REQUIRED AND A BAD ONE REJECTS THE WHOLE OBJECT. It is the capture
 * time and the expiry basis, so a record without a trustworthy one cannot be
 * aged and cannot say when the arrival happened. Rejecting costs only the jsonb
 * blob: the lead's src, code and utm_* are separate columns and arrive
 * independently.
 */
export function sanitizeAttributionObject(value: unknown): Attribution | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.ts !== 'number' || !Number.isFinite(o.ts)) return null;

  const out: Attribution = {
    src: sanitizeTag(o.src, 'src'),
    code: sanitizeTag(o.code, 'code'),
    ref: sanitizeTag(o.ref, 'ref'),
    utm_source: sanitizeTag(o.utm_source, 'utm_source'),
    utm_medium: sanitizeTag(o.utm_medium, 'utm_medium'),
    utm_campaign: sanitizeTag(o.utm_campaign, 'utm_campaign'),
    utm_content: sanitizeTag(o.utm_content, 'utm_content'),
    landing_path: sanitizeLandingPath(o.landing_path),
    ts: o.ts,
  };
  // A record with every tag now invalid is not attribution, it is noise.
  if (!isTagged(out)) return null;

  // Belt and braces against the CHECK, and NOT dead code even though the fields
  // above are individually bounded. 7 tags at 40 plus a 200 character path plus a
  // timestamp cannot reach 2000 today -- attribution.limits.test.ts proves that
  // with the largest object the sanitizers can produce -- but "cannot happen" is
  // exactly the kind of claim this repo keeps paying for, and the cost of being
  // wrong is a lost pass lead rather than a dropped field.
  if (JSON.stringify(out).length > ATTR_MAX_FIRST_TOUCH_CHARS) return null;

  return out;
}

/** Parse a stored envelope, revalidate it, and age it out. */
function parseStored(raw: string | null, ttlMs: number, now: number): Attribution | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const out = sanitizeAttributionObject(parsed);
  if (!out) return null;
  // A value stamped in the future cannot be aged either: now - ts is negative and
  // would never exceed the window, so the record would outlive its TTL forever.
  if (now - out.ts > ttlMs || now - out.ts < 0) return null;
  return out;
}

/**
 * localStorage, or null, and never a throw.
 *
 * The property ACCESS is inside the try, not just the method call: an iOS
 * webview with cookies blocked throws on `window.localStorage` itself, before
 * getItem is reached.
 */
function store(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readKey(key: string, ttlMs: number, now: number): Attribution | null {
  const s = store();
  if (!s) return null;
  try {
    return parseStored(s.getItem(key), ttlMs, now);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: Attribution): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    // Quota, private mode, or a blocked origin. The app behaves identically
    // without storage; the URL-borne values still reach the lead on this visit.
  }
}

/** First touch, if it is still inside its 90 days. */
export function readFirstTouch(now: number = Date.now()): Attribution | null {
  return readKey(FIRST_TOUCH_KEY, FIRST_TOUCH_TTL_MS, now);
}

/** Last touch, if it is still inside its 30 days. */
export function readLastTouch(now: number = Date.now()): Attribution | null {
  return readKey(LAST_TOUCH_KEY, LAST_TOUCH_TTL_MS, now);
}

export interface CaptureResult {
  /** Did this page load carry tags? False on almost every navigation. */
  captured: boolean;
  /** What this visit carried, tags or not. */
  visit: Attribution;
  first: Attribution | null;
  last: Attribution | null;
}

/**
 * The whole of part A: read the URL, remember it, and report what is known.
 *
 * FIRST TOUCH IS WRITTEN ONLY WHEN THERE IS NOTHING THERE. Not "when the new
 * value looks better", not "when the old one is older" -- first touch is a claim
 * about the first time this browser ever arrived tagged, and any rule that can
 * overwrite it makes it a second last-touch under a misleading name. It is
 * rewritten only when the stored one has aged out of its 90 days, at which point
 * there is no first touch to preserve.
 *
 * LAST TOUCH IS WRITTEN ON EVERY TAGGED VISIT. An untagged navigation must not
 * clear it: somebody who arrives from Instagram and then taps through four
 * screens is still here because of Instagram.
 */
export function captureAttribution(search: string, pathname: string, now: number = Date.now()): CaptureResult {
  const visit = readAttributionFromUrl(search, pathname, now);
  const captured = isTagged(visit);

  if (captured) {
    if (readFirstTouch(now) === null) writeKey(FIRST_TOUCH_KEY, visit);
    writeKey(LAST_TOUCH_KEY, visit);
  }

  return { captured, visit, first: readFirstTouch(now), last: readLastTouch(now) };
}

/**
 * The attribution a form should submit: the URL if it has any, else last touch.
 *
 * URL WINS, WHOLE, AND IS NOT MERGED FIELD BY FIELD. A visitor who opens
 * `/pase/bullbox/?src=walkin` after arriving from Instagram last week came in
 * off the walk-in QR, and a per-field merge would hand that lead
 * `src=walkin, utm_campaign=hyrox-oct` -- a combination that never existed and
 * that double-counts one person across two channels. One visit, one origin.
 */
export function attributionForSubmit(visit: Attribution | null, last: Attribution | null): Attribution | null {
  if (isTagged(visit)) return visit;
  if (isTagged(last)) return last;
  return null;
}

/**
 * A per-tab key so a reload does not count as a second visit.
 *
 * sessionStorage, not localStorage: it must die with the tab, because its only
 * job is to deduplicate one person's one arrival. A persistent key would make
 * every future visit from that browser look like the same visit.
 *
 * NOT AN IDENTIFIER, and it must not become one. It is generated from
 * crypto.getRandomValues with no reference to any account, and migration 213's
 * comment on attribution_events.session_key says the same thing from the other
 * side. The charset and the 8-to-64 length match that table's CHECK, which is
 * pinned rather than loose precisely because this value comes from our own code
 * three lines before it is sent: a malformed one is a bug, not a visitor's typo,
 * and there is nothing to lose by refusing it.
 */
export function getSessionKey(): string | null {
  let s: Storage | null = null;
  try {
    if (typeof window === 'undefined') return null;
    s = window.sessionStorage;
  } catch {
    return null;
  }
  try {
    const existing = s.getItem(SESSION_KEY_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  } catch {
    // Fall through and mint a fresh one; a key we cannot read is no key.
  }
  const minted = mintSessionKey();
  if (!minted) return null;
  try {
    s.setItem(SESSION_KEY_STORAGE, minted);
  } catch {
    // Unstorable is fine. The event still carries a key, so it is still
    // well formed; it just cannot be deduplicated against a later one.
  }
  return minted;
}

function mintSessionKey(): string | null {
  try {
    const bytes = new Uint8Array(16);
    // crypto.getRandomValues, never Math.random: this is a dedupe key written to
    // a unique index, and a weak generator means collisions, which here means
    // silently dropped visits.
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}
