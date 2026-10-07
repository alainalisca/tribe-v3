/**
 * T-AV24: what may reach the browser. The exact-keys assertions are the point:
 * everything in the view is serialized into the RSC payload, so a key that is
 * not listed here is a leak.
 */
import { describe, it, expect } from 'vitest';
import { buildAthleteLink, isLinkActive, toAthleteHomeView, whatsappShareUrl } from './athleteHomeView';
import { summaryProgram } from './fixtures';

const EXTRAS = {
  link: 'http://localhost:3001/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ',
  qrSvg: '<svg/>',
  firstName: 'Ana',
  avatarUrl: null,
};

function allKeys(o: unknown, prefix = ''): string[] {
  if (Array.isArray(o)) return o.length ? allKeys(o[0], `${prefix}[]`) : [];
  if (o && typeof o === 'object') {
    return Object.entries(o).flatMap(([k, v]) => [`${prefix}${k}`, ...allKeys(v, `${prefix}${k}.`)]);
  }
  return [];
}

describe('toAthleteHomeView', () => {
  it('builds EXACTLY the allowlisted fields, at every depth', () => {
    expect(allKeys(toAthleteHomeView(summaryProgram(), EXTRAS)).sort()).toEqual(
      [
        'state',
        'partnerName',
        'firstName',
        'avatarUrl',
        'level',
        'linkActive',
        'link',
        'qrSvg',
        'counts',
        'counts.invited',
        'counts.showedUp',
        'counts.joined',
        'counts.stayed',
        'progress',
        'progress.showups',
        'progress.promoteAt',
        'readyToPromote',
        'guests',
        'guests.[]firstName',
        'guests.[]claimedAt',
        'guests.[]status',
        'guests.[]noCreditReason',
        'rewards',
        'rewards.showupEn',
        'rewards.showupEs',
        'rewards.classAccessEn',
        'rewards.classAccessEs',
        'rewards.bonusCop',
        'rewards.bonusNoteEn',
        'rewards.bonusNoteEs',
      ].sort()
    );
  });

  it('carries none of the ids, the welcome offer or the gym-side bonus counts', () => {
    const json = JSON.stringify(toAthleteHomeView(summaryProgram(), EXTRAS));
    // The ref code is inside the link on purpose; there is no separate field
    // for it (pinned by the exact-keys test above).
    for (const absent of [
      '00000000-0000-4000-8000-000000002001',
      'ccb8502a',
      'welcome',
      'Primer mes',
      'bonus_owed',
      'not_credited',
    ]) {
      expect(json, absent).not.toContain(absent);
    }
  });

  it('maps the ledger counts one to one (Siguen is retained)', () => {
    const v = toAthleteHomeView(
      summaryProgram({
        counts: { invited: 7, not_credited: 5, showed_up: 6, joined: 3, retained: 1, bonus_owed: 2, bonus_settled: 1 },
      }),
      EXTRAS
    );
    expect(v.counts).toEqual({ invited: 7, showedUp: 6, joined: 3, stayed: 1 });
  });

  it('decision 2: a captain gets no bonus amount or note; athlete and sponsored do', () => {
    expect(toAthleteHomeView(summaryProgram({ level: 'captain' }), EXTRAS).rewards).toMatchObject({
      bonusCop: null,
      bonusNoteEn: null,
      bonusNoteEs: null,
    });
    for (const level of ['athlete', 'sponsored'] as const) {
      expect(toAthleteHomeView(summaryProgram({ level }), EXTRAS).rewards.bonusCop).toBe(50000);
    }
  });

  it('decision 1: paused, ended or program off means no link and no QR, even if the page passed one', () => {
    for (const o of [
      { status: 'paused' as const },
      { status: 'ended' as const },
      { program_active: false },
      { program_active: null },
    ]) {
      const v = toAthleteHomeView(summaryProgram(o), EXTRAS);
      expect([v.linkActive, v.link, v.qrSvg]).toEqual([false, null, null]);
    }
    expect(isLinkActive(summaryProgram())).toBe(true);
  });
});

describe('the link and the WhatsApp share', () => {
  it('is the link shape T-AV23 resolves', () => {
    expect(buildAthleteLink('https://tribe-v3.vercel.app', 'bullbox-prueba', 'ANA-7KQ')).toBe(
      'https://tribe-v3.vercel.app/pase/bullbox-prueba/?src=atleta&code=ANA-7KQ'
    );
  });

  it('encodes the whole message, so the link inside arrives intact', () => {
    // The text itself is athleteHome.shareMessage in messages/*.json.
    const msg = `Ven a entrenar conmigo en BullBox (Prueba). Tu primera clase es gratis: ${EXTRAS.link}`;
    const url = whatsappShareUrl(msg);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(url).not.toContain('&code='); // the inner & is encoded, not a second wa.me parameter
    expect(new URL(url).searchParams.get('text')).toBe(msg);
  });
});
