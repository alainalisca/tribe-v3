/**
 * T-GROW1 part A behaviour.
 *
 * WHAT EACH BLOCK IS ACTUALLY FOR, because a list of green assertions about a
 * sanitizer is cheap and mostly worthless. The cases here are the ones where
 * getting it wrong produces a WRONG NUMBER rather than a missing one, which is
 * the failure that survives review:
 *
 *   casing          one channel reported as three rows, each looking small
 *   first touch     a second last-touch wearing the name "first"
 *   URL wins whole  one person counted against two channels at once
 *   revalidation    a value from storage violating the CHECK the route enforces
 *   storage blocked the spec's own definition of done, and Safari private mode
 *
 * Every storage test asserts the ATTEMPT AND THE OUTCOME. CLAUDE.md records
 * `expect(send).toHaveBeenCalledOnce()` passing over a send that failed on its
 * own response shape: asserting a call happened is not asserting what it did.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ATTR_MAX_LEN,
  FIRST_TOUCH_KEY,
  LAST_TOUCH_KEY,
  FIRST_TOUCH_TTL_MS,
  LAST_TOUCH_TTL_MS,
  SESSION_KEY_STORAGE,
  attributionForSubmit,
  captureAttribution,
  getSessionKey,
  isTagged,
  readAttributionFromUrl,
  readFirstTouch,
  readLastTouch,
  sanitizeLandingPath,
  sanitizeTag,
  type Attribution,
} from './attribution';

const NOW = 1_760_000_000_000;

/** A localStorage stand-in whose failure modes can be switched on. */
function makeStorage(mode: 'ok' | 'throw-on-set' | 'throw-on-get' | 'throw-on-access' = 'ok') {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => {
      if (mode === 'throw-on-get') throw new DOMException('denied');
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (mode === 'throw-on-set') throw new DOMException('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
  return { store, data, mode };
}

function installStorage(kind: 'localStorage' | 'sessionStorage', s: ReturnType<typeof makeStorage>) {
  if (s.mode === 'throw-on-access') {
    // The getter itself throws. This is the iOS webview with cookies blocked, and
    // it is why lib/attribution.ts puts the PROPERTY ACCESS inside the try and
    // not only the method call.
    Object.defineProperty(window, kind, {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.');
      },
    });
    return;
  }
  Object.defineProperty(window, kind, { configurable: true, value: s.store, writable: true });
}

let local: ReturnType<typeof makeStorage>;

beforeEach(() => {
  local = makeStorage();
  installStorage('localStorage', local);
  installStorage('sessionStorage', makeStorage());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sanitizeTag', () => {
  it('lowercases a channel and uppercases a printed code', () => {
    // The casing cases are not cosmetic. `Instagram` and `instagram` arriving as
    // two rows splits one channel into two that each look too small to matter,
    // and `runclub-sat0927` on a poster is the same code as `RUNCLUB-SAT0927`.
    expect(sanitizeTag('Instagram', 'src')).toBe('instagram');
    expect(sanitizeTag('SOCIAL', 'utm_medium')).toBe('social');
    expect(sanitizeTag('runclub-sat0927', 'code')).toBe('RUNCLUB-SAT0927');
    expect(sanitizeTag('a7k2qx', 'ref')).toBe('A7K2QX');
  });

  it('drops anything outside the charset to null rather than stripping it', () => {
    // Dropping and stripping are different answers. `ig reel` stripped to `igreel`
    // is a channel nobody named; dropped to null it is an untagged lead, which is
    // true. 173's sanitizeTag settled this and the same rule applies here.
    expect(sanitizeTag('ig reel', 'src')).toBeNull();
    expect(sanitizeTag('<script>', 'src')).toBeNull();
    expect(sanitizeTag('café', 'src')).toBeNull();
    expect(sanitizeTag('a/b', 'src')).toBeNull();
  });

  it('trims surrounding whitespace before judging', () => {
    // A QR printed with a stray space before the closing quote is a real thing
    // and it is not the visitor's fault.
    expect(sanitizeTag('  runclub  ', 'src')).toBe('runclub');
    expect(sanitizeTag('   ', 'src')).toBeNull();
  });

  it('accepts exactly the bound and refuses one more', () => {
    expect(sanitizeTag('a'.repeat(ATTR_MAX_LEN), 'src')).toHaveLength(ATTR_MAX_LEN);
    expect(sanitizeTag('a'.repeat(ATTR_MAX_LEN + 1), 'src')).toBeNull();
  });

  it('is null for every non-string', () => {
    for (const v of [null, undefined, 42, {}, [], true]) expect(sanitizeTag(v, 'src')).toBeNull();
  });
});

describe('sanitizeLandingPath', () => {
  it('keeps the path and discards the query and the fragment', () => {
    // The query is where the tags are, and they get their own columns. It is also
    // where a token would be if one ever ended up in a link, so the one field
    // that could quietly accumulate secrets does not store it.
    expect(sanitizeLandingPath('/pase/bullbox/?src=ig&code=X#top')).toBe('/pase/bullbox/');
  });

  it('truncates rather than dropping, unlike a tag', () => {
    expect(sanitizeLandingPath('/' + 'p'.repeat(500))).toHaveLength(200);
  });

  it('is null for an empty path', () => {
    expect(sanitizeLandingPath('')).toBeNull();
    expect(sanitizeLandingPath('?a=b')).toBeNull();
  });
});

describe('readAttributionFromUrl', () => {
  it('reads all seven tags and the path', () => {
    const a = readAttributionFromUrl(
      '?src=RunClub&code=runclub-sat0927&ref=a7k2qx&utm_source=Instagram&utm_medium=Social&utm_campaign=Hyrox-Oct&utm_content=Reel-01',
      '/pase/bullbox/',
      NOW
    );
    expect(a).toEqual({
      src: 'runclub',
      code: 'RUNCLUB-SAT0927',
      ref: 'A7K2QX',
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: 'hyrox-oct',
      utm_content: 'reel-01',
      landing_path: '/pase/bullbox/',
      ts: NOW,
    });
  });

  it('a path with no parameters is not tagged', () => {
    const a = readAttributionFromUrl('', '/feed', NOW);
    expect(isTagged(a)).toBe(false);
    expect(a.landing_path).toBe('/feed');
  });

  it('one valid tag beside one invalid one keeps the valid one', () => {
    const a = readAttributionFromUrl('?src=runclub&code=not a code', '/', NOW);
    expect(a.src).toBe('runclub');
    expect(a.code).toBeNull();
    expect(isTagged(a)).toBe(true);
  });
});

describe('captureAttribution', () => {
  it('writes both keys on a tagged visit and reads them back', () => {
    const r = captureAttribution('?src=runclub&code=RUNCLUB-SAT0927', '/', NOW);
    expect(r.captured).toBe(true);
    // The OUTCOME, read back through the public reader, not just "setItem was
    // called". A write that landed in the wrong key or in the wrong shape passes
    // a call-count assertion and fails this one.
    expect(readFirstTouch(NOW)?.code).toBe('RUNCLUB-SAT0927');
    expect(readLastTouch(NOW)?.code).toBe('RUNCLUB-SAT0927');
  });

  it('writes nothing at all on an untagged visit', () => {
    captureAttribution('', '/feed', NOW);
    expect(local.data.size).toBe(0);
    expect(readFirstTouch(NOW)).toBeNull();
  });

  it('NEVER overwrites first touch, and does overwrite last touch', () => {
    captureAttribution('?src=runclub&code=FIRST-01', '/', NOW);
    const later = NOW + 5 * 86_400_000;
    captureAttribution('?src=instagram&code=SECOND-02', '/feed', later);

    // The property that makes "first touch" mean anything. Any rule that can
    // overwrite it turns it into a second last-touch under a misleading name.
    expect(readFirstTouch(later)?.code).toBe('FIRST-01');
    expect(readFirstTouch(later)?.src).toBe('runclub');
    expect(readLastTouch(later)?.code).toBe('SECOND-02');
    expect(readLastTouch(later)?.src).toBe('instagram');
  });

  it('an untagged visit between two tagged ones clears neither', () => {
    captureAttribution('?src=runclub&code=FIRST-01', '/', NOW);
    captureAttribution('', '/feed', NOW + 1000);
    // Somebody who arrives from Instagram and then taps through four screens is
    // still here because of Instagram.
    expect(readLastTouch(NOW + 1000)?.code).toBe('FIRST-01');
  });

  it('expires last touch at 30 days and first touch at 90', () => {
    captureAttribution('?src=runclub&code=FIRST-01', '/', NOW);

    const day31 = NOW + LAST_TOUCH_TTL_MS + 1;
    expect(readLastTouch(day31)).toBeNull();
    expect(readFirstTouch(day31)?.code).toBe('FIRST-01');

    const day91 = NOW + FIRST_TOUCH_TTL_MS + 1;
    expect(readFirstTouch(day91)).toBeNull();
  });

  it('an expired first touch is replaced by the next tagged visit', () => {
    captureAttribution('?src=runclub&code=OLD-01', '/', NOW);
    const day91 = NOW + FIRST_TOUCH_TTL_MS + 1;
    captureAttribution('?src=instagram&code=NEW-02', '/', day91);
    // There is no first touch to preserve once it has aged out, so the next
    // arrival becomes the first one. The alternative is a key that can never be
    // written again after 90 days.
    expect(readFirstTouch(day91)?.code).toBe('NEW-02');
  });
});

describe('stored values are revalidated, not trusted', () => {
  it('discards a stored record whose tag now violates the charset', () => {
    // localStorage is writable by anything on this origin, including an extension
    // and including a previous version of this code with different rules. Without
    // revalidation such a value reaches the pass POST and then the CHECK, and a
    // CHECK violation on pass_leads loses the lead rather than the field.
    local.data.set(LAST_TOUCH_KEY, JSON.stringify({ src: 'ig reel', code: null, ts: NOW }));
    expect(readLastTouch(NOW)).toBeNull();
  });

  it('discards a stored record whose tag is over the length bound', () => {
    local.data.set(LAST_TOUCH_KEY, JSON.stringify({ src: 'a'.repeat(100), ts: NOW }));
    expect(readLastTouch(NOW)).toBeNull();
  });

  it('keeps the valid fields of a partly invalid record', () => {
    local.data.set(
      LAST_TOUCH_KEY,
      JSON.stringify({ src: 'runclub', code: 'bad code', utm_campaign: 'hyrox-oct', ts: NOW })
    );
    const a = readLastTouch(NOW);
    expect(a?.src).toBe('runclub');
    expect(a?.code).toBeNull();
    expect(a?.utm_campaign).toBe('hyrox-oct');
  });

  it('discards malformed JSON, a non-object, and a record with no usable ts', () => {
    for (const raw of ['{not json', '"a string"', '[1,2]', JSON.stringify({ src: 'ig' })]) {
      local.data.set(LAST_TOUCH_KEY, raw);
      expect(readLastTouch(NOW), `raw: ${raw}`).toBeNull();
    }
  });

  it('discards a record stamped in the future', () => {
    // A clock that moved backwards, or a hand-edited value. Without the lower
    // bound such a record would outlive its TTL indefinitely, because now - ts is
    // negative and never exceeds the window.
    local.data.set(FIRST_TOUCH_KEY, JSON.stringify({ src: 'runclub', ts: NOW + 86_400_000 }));
    expect(readFirstTouch(NOW)).toBeNull();
  });
});

describe('storage blocked, which is the spec definition of done', () => {
  it('captures from the URL and reports it even when setItem throws', () => {
    installStorage('localStorage', makeStorage('throw-on-set'));
    const r = captureAttribution('?src=runclub&code=RUNCLUB-SAT0927', '/pase/bullbox/', NOW);
    // THE VISIT IS STILL ATTRIBUTED. Safari private mode throws here, and the
    // lead submitted on this page load still carries its source because the pass
    // form reads `visit`, not storage. What is lost is only the memory of it for
    // a LATER page load.
    expect(r.captured).toBe(true);
    expect(r.visit.code).toBe('RUNCLUB-SAT0927');
    expect(r.first).toBeNull();
    expect(r.last).toBeNull();
    expect(attributionForSubmit(r.visit, r.last)?.code).toBe('RUNCLUB-SAT0927');
  });

  it('does not throw when getItem throws', () => {
    installStorage('localStorage', makeStorage('throw-on-get'));
    expect(() => captureAttribution('?src=runclub', '/', NOW)).not.toThrow();
    expect(readLastTouch(NOW)).toBeNull();
  });

  it('does not throw when the localStorage GETTER itself throws', () => {
    // An iOS webview with cookies blocked raises on `window.localStorage` before
    // any method is reached. A try around only the getItem call would not help.
    installStorage('localStorage', makeStorage('throw-on-access'));
    expect(() => captureAttribution('?src=runclub', '/', NOW)).not.toThrow();
    expect(readFirstTouch(NOW)).toBeNull();
  });
});

describe('attributionForSubmit', () => {
  const tagged = (over: Partial<Attribution>): Attribution => ({
    src: null,
    code: null,
    ref: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    landing_path: '/',
    ts: NOW,
    ...over,
  });

  it('falls back to last touch when the URL has nothing', () => {
    // The scenario the whole ticket exists for: land on / tagged, browse, open
    // the pass with no parameters, still get credited.
    const last = tagged({ src: 'runclub', code: 'RUNCLUB-SAT0927' });
    expect(attributionForSubmit(tagged({}), last)?.code).toBe('RUNCLUB-SAT0927');
  });

  it('prefers the URL and takes it WHOLE, never merging field by field', () => {
    const last = tagged({ src: 'instagram', utm_campaign: 'hyrox-oct', utm_content: 'reel-01' });
    const visit = tagged({ src: 'walkin' });
    const out = attributionForSubmit(visit, last);
    expect(out?.src).toBe('walkin');
    // THE ASSERTION THAT MATTERS. A per-field merge would hand this lead
    // src=walkin with utm_campaign=hyrox-oct -- a combination that never existed,
    // and one person counted against two channels in the same table.
    expect(out?.utm_campaign).toBeNull();
    expect(out?.utm_content).toBeNull();
  });

  it('is null when neither carries a tag', () => {
    expect(attributionForSubmit(tagged({}), tagged({}))).toBeNull();
    expect(attributionForSubmit(null, null)).toBeNull();
  });
});

describe('getSessionKey', () => {
  it('mints a key matching the table CHECK and reuses it within the session', () => {
    const first = getSessionKey();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    // Stable within a session, or a reload counts as a second visit and inflates
    // the denominator this exists to protect.
    expect(getSessionKey()).toBe(first);
  });

  it('replaces a stored key that does not match the CHECK', () => {
    const s = makeStorage();
    installStorage('sessionStorage', s);
    s.data.set(SESSION_KEY_STORAGE, 'no good!');
    // A key the database would refuse is no key. Keeping it would mean every
    // visit event from this tab is rejected with 23514 and silently lost.
    expect(getSessionKey()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getSessionKey()).not.toBe('no good!');
  });

  it('still returns a usable key when sessionStorage cannot be written', () => {
    installStorage('sessionStorage', makeStorage('throw-on-set'));
    // Unstorable is fine: the event is still well formed, it just cannot be
    // deduplicated against a later one. Returning null here would drop the visit
    // entirely, which is the worse of the two.
    expect(getSessionKey()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('returns null rather than throwing when the getter is blocked', () => {
    installStorage('sessionStorage', makeStorage('throw-on-access'));
    expect(getSessionKey()).toBeNull();
  });

  it('uses crypto.getRandomValues and not Math.random', () => {
    // This key is written to a unique index, so a weak generator means collisions,
    // and a collision here is a silently dropped visit rather than a visible
    // error. Asserted on the CALL because the outcome of a good and a bad
    // generator look identical in one sample.
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    installStorage('sessionStorage', makeStorage());
    getSessionKey();
    expect(spy).toHaveBeenCalled();
  });
});
