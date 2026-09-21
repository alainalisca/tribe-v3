import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Migration 179 collapsed users.banner_url and users.storefront_banner_url
 * into users.cover_image_url. This guard stops either old column coming back.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS ENUMERATES A POPULATION INSTEAD OF ATTRIBUTING COLUMNS TO TABLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The obvious guard parses each query, works out which table it targets, and
 * flags only the `users` reads. It cannot be written correctly here, and the
 * proof is in this repo rather than in principle.
 *
 * `lib/dal/spotlight.ts` reads users.storefront_banner_url like this:
 *
 *     const INSTRUCTOR_FIELDS = 'id, name, avatar_url, storefront_...';
 *     .from('instructor_spotlight')
 *     .select(`... instructor:instructor_id(${INSTRUCTOR_FIELDS})`)
 *
 * To attribute that column to `users`, a parser must (a) know the embed
 * `instructor:instructor_id(...)` resolves through a foreign key to `users`
 * -- THE STRING `users` APPEARS NOWHERE -- and (b) resolve a template
 * interpolation back to a constant declared 70 lines earlier. (a) needs the
 * schema, not the source. (b) is the template-literal blindness that made the
 * T-AUD3 guard unable to catch the bug it was written for.
 *
 * Meanwhile `lib/dal/sessions.ts` DOES name it:
 *     creator:users!sessions_creator_id_fkey(..., cover_image_url)
 *
 * So the two users-reads in this codebase use two different embed spellings,
 * and a parser tuned to either one misses the other. A guard matching
 * `users(...)` would have sailed straight past spotlight -- the newest site,
 * and the one that was missing from two successive scoping passes.
 *
 * So this guard never tries to understand a query. It asserts that the SET of
 * places mentioning the old names is exactly a frozen list. Nesting, FK-named
 * embeds and interpolation cannot fool it, because it does not look at them.
 *
 * It is deliberately over-broad: a genuinely new featured_partners.banner_url
 * read must be added below WITH A REASON. That is the point -- a conscious
 * decision rather than a silent pass.
 *
 * THE LIMIT, STATED: this proves no NEW mention appears. It does not prove the
 * remaining ones are non-`users`. That was checked by hand once, when the
 * branch landed. Keying on COUNTS rather than filenames is what stops it
 * eroding -- otherwise a file already listed could add a `users` read and stay
 * green, which is the obvious way to satisfy this guard dishonestly.
 */

/** banner_url ALSO exists on featured_partners, a different table that 179 did
 *  not touch. Each entry says why it is allowed and how many times. */
const BANNER_URL_ALLOWED: Record<string, { count: number; why: string }> = {
  'lib/dal/featuredPartners.ts': {
    count: 5,
    why: 'featured_partners.banner_url. Its embedded user:users(avatar_url) reads only the avatar, no banner.',
  },
  'lib/partnerPublic.ts': {
    count: 2,
    why: 'partners_public.banner_url -- the public partner view, a different table.',
  },
  'lib/partnerPublic.test.ts': { count: 1, why: 'fixture for the partners_public row above.' },
  'components/FeaturedPartnerBanner.stats.test.tsx': {
    count: 1,
    why: 'fixture for a featured_partners row.',
  },
  'components/storefront/GymStorefrontHeader.tsx': {
    count: 1,
    why: 'partner.banner_url is featured_partners. The two ACCOUNT columns beside it collapsed into cover_image_url, turning a three-way fallback into two.',
  },
  'lib/database.types.ts': {
    count: 8,
    why: 'Generated from the live schema, which still HAS both old columns -- they are dropped in a later migration, not this one. 3 users (Row/Insert/Update) + 3 featured_partners + 2 hand-written FeaturedPartner types.',
  },
};

/** storefront_banner_url only ever existed on users, so there is no second
 *  table to exempt and the tolerance outside generated types is zero. */
const STOREFRONT_BANNER_ALLOWED: Record<string, { count: number; why: string }> = {
  'lib/database.types.ts': {
    count: 3,
    why: 'Generated. The column still exists in the database until the drop migration; Row/Insert/Update.',
  },
};

const ROOTS = ['app', 'components', 'lib', 'contexts', 'hooks'];

/** This file lists the very strings it hunts for, so scanning itself would
 *  count its own configuration as product code -- the trap that kept `unete`
 *  flagged after every real occurrence had been fixed. Excluded by path, with
 *  the reason, per CLAUDE.md. `supabase/` is excluded for the same reason:
 *  the migration, its rehearsal and its captures all name the old columns by
 *  necessity, and that is the record, not a read site. */
const SELF = 'lib/coverImage.singleColumn.test.ts';

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) out.push(relative(process.cwd(), full));
    }
  };
  ROOTS.forEach(walk);
  return out.filter((f) => f !== SELF);
}

function countOf(file: string, needle: string): number {
  return readFileSync(file, 'utf8').split(needle).length - 1;
}

/** storefront_banner_url is a substring of nothing else; banner_url is a
 *  substring OF storefront_banner_url, so a bare count must subtract it or
 *  every storefront mention is double-reported. */
function bannerUrlCount(file: string): number {
  return countOf(file, 'banner_url');
}

describe('users.cover_image_url is the only cover column (migration 179)', () => {
  it('no source file outside the allow-list mentions banner_url', () => {
    const offenders = sourceFiles()
      .map((f) => ({ f, n: bannerUrlCount(f) }))
      .filter(({ f, n }) => n > 0 && !(f in BANNER_URL_ALLOWED));
    expect(
      offenders.map(({ f, n }) => `${f} (${n}x)`),
      'These read a column 179 replaced. Use users.cover_image_url, or add an entry above with a reason if it is featured_partners.'
    ).toEqual([]);
  });

  it('allow-listed files hold exactly the expected number of banner_url mentions', () => {
    const drift = Object.entries(BANNER_URL_ALLOWED)
      .map(([f, { count }]) => ({ f, want: count, got: bannerUrlCount(f) }))
      .filter(({ want, got }) => want !== got);
    expect(
      drift.map(({ f, want, got }) => `${f}: expected ${want}, found ${got}`),
      'Counts are pinned, not just filenames -- otherwise an allowed file could add a users read and stay green.'
    ).toEqual([]);
  });

  it('no source file outside generated types mentions storefront_banner_url', () => {
    const offenders = sourceFiles()
      .map((f) => ({ f, n: countOf(f, 'storefront_banner_url') }))
      .filter(({ f, n }) => n > 0 && !(f in STOREFRONT_BANNER_ALLOWED));
    expect(
      offenders.map(({ f, n }) => `${f} (${n}x)`),
      'storefront_banner_url only ever existed on users. There is no other table it could belong to.'
    ).toEqual([]);
  });

  it('generated types hold exactly the expected storefront_banner_url count', () => {
    const drift = Object.entries(STOREFRONT_BANNER_ALLOWED)
      .map(([f, { count }]) => ({ f, want: count, got: countOf(f, 'storefront_banner_url') }))
      .filter(({ want, got }) => want !== got);
    expect(drift.map(({ f, want, got }) => `${f}: expected ${want}, found ${got}`)).toEqual([]);
  });

  /** Rot test. Without it, the day someone migrates featuredPartners.ts or the
   *  drop migration lands and types are regenerated, that entry becomes a
   *  permanent hole and the next banner_url added to it passes unnoticed. */
  it('every allow-list entry still offends, or it should be removed', () => {
    const stale: string[] = [];
    for (const [f, { count }] of Object.entries(BANNER_URL_ALLOWED)) {
      if (bannerUrlCount(f) === 0) stale.push(`${f} (expected ${count}, now clean)`);
    }
    for (const [f, { count }] of Object.entries(STOREFRONT_BANNER_ALLOWED)) {
      if (countOf(f, 'storefront_banner_url') === 0) stale.push(`${f} (expected ${count}, now clean)`);
    }
    expect(stale, 'Remove these from the allow-lists above -- they are fixed.').toEqual([]);
  });

  it('every allow-list entry carries a reason', () => {
    const unexplained = [...Object.entries(BANNER_URL_ALLOWED), ...Object.entries(STOREFRONT_BANNER_ALLOWED)]
      .filter(([, { why }]) => !why || why.trim().length < 20)
      .map(([f]) => f);
    expect(unexplained, 'An exemption without a reason is a suppression nobody can audit.').toEqual([]);
  });
});
