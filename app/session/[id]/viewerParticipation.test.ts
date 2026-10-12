import { describe, it, expect } from 'vitest';
import { resolveViewerParticipation } from './viewerParticipation';

const USER = 'user-ana';

/** The roster the page loads: confirmed participants only (fetchSessionWithDetails). */
const confirmedRoster = [
  { user_id: 'someone-else', status: 'confirmed' },
  { user_id: USER, status: 'confirmed' },
];

describe('resolveViewerParticipation', () => {
  it('REGRESSION: a pending request is pending even though the confirmed-only roster cannot contain it', () => {
    // The bug: isPending was read from the roster, which only ever holds
    // confirmed rows, so an athlete who had just requested a paid or curated
    // session never showed as pending (no awaiting-payment state, no
    // instructions, no pay sheet).
    expect(
      resolveViewerParticipation({ ownRow: { success: true, data: { status: 'pending' } }, roster: [], userId: USER })
    ).toEqual({ hasJoined: false, isPending: true, source: 'own-row' });
  });

  it('a confirmed own row is joined', () => {
    expect(
      resolveViewerParticipation({
        ownRow: { success: true, data: { status: 'confirmed' } },
        roster: confirmedRoster,
        userId: USER,
      })
    ).toEqual({ hasJoined: true, isPending: false, source: 'own-row' });
  });

  it('no own row is neither joined nor pending', () => {
    expect(resolveViewerParticipation({ ownRow: { success: true, data: null }, roster: [], userId: USER })).toEqual({
      hasJoined: false,
      isPending: false,
      source: 'own-row',
    });
  });

  it.each(['cancelled', 'withdrawn'])('a %s own row is neither joined nor pending', (status) => {
    expect(
      resolveViewerParticipation({ ownRow: { success: true, data: { status } }, roster: [], userId: USER })
    ).toEqual({ hasJoined: false, isPending: false, source: 'own-row' });
  });

  it('falls back to the roster when the own-row read fails, and says so', () => {
    expect(
      resolveViewerParticipation({ ownRow: { success: false, error: 'boom' }, roster: confirmedRoster, userId: USER })
    ).toEqual({ hasJoined: true, isPending: false, source: 'roster-fallback' });
  });
});
