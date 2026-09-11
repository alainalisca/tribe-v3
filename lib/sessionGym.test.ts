import { describe, it, expect } from 'vitest';
import { resolveSessionGym, presenterGymMark, type SessionGymSource } from './sessionGym';

const BULLBOX: SessionGymSource = {
  id: 'p1',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  logo_url: null,
  status: 'active',
  user_id: 'gym-user',
};
const COACH = 'coach-user';

describe('resolveSessionGym', () => {
  it('shows the venue when the gym approved it', () => {
    const r = resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'approved', creatorId: COACH });
    expect(r.venue?.business_name).toBe('CrossFit BullBox');
    expect(r.pending).toBeNull();
  });

  it('shows no venue while the request is pending', () => {
    const r = resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'pending', creatorId: COACH });
    expect(r.venue).toBeNull();
  });

  it('shows no venue when the gym declined', () => {
    const r = resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'declined', creatorId: COACH });
    expect(r.venue).toBeNull();
  });

  it('drops the venue when the partner is no longer active', () => {
    // Testing note 4: flip status to expired and the identity goes, but the
    // session keeps rendering.
    const r = resolveSessionGym({
      sessionPartner: { ...BULLBOX, status: 'expired' },
      sessionPartnerStatus: 'approved',
      creatorId: COACH,
    });
    expect(r.venue).toBeNull();
  });

  it('never borrows the gym name from the creator roster for the venue', () => {
    // The gym owns its name (Al, 2026-09-08). A session with no partner_id gets
    // no chip and no bold venue, however affiliated its creator is.
    const r = resolveSessionGym({ sessionPartner: null, creatorPartner: BULLBOX, creatorId: COACH });
    expect(r.venue).toBeNull();
    expect(r.affiliation?.business_name).toBe('CrossFit BullBox');
  });

  it('shows the affiliation tag without any approval, since it describes the person', () => {
    const r = resolveSessionGym({ sessionPartner: null, creatorPartner: BULLBOX });
    expect(r.affiliation).not.toBeNull();
  });

  it('shows Pendiente only to the creator', () => {
    const args = { sessionPartner: BULLBOX, sessionPartnerStatus: 'pending', creatorId: COACH };
    expect(resolveSessionGym({ ...args, viewerId: COACH }).pending?.business_name).toBe('CrossFit BullBox');
    expect(resolveSessionGym({ ...args, viewerId: 'someone-else' }).pending).toBeNull();
    expect(resolveSessionGym({ ...args, viewerId: null }).pending).toBeNull();
  });

  it('treats the gym as the presenter when the gym account is the creator', () => {
    const r = resolveSessionGym({
      sessionPartner: BULLBOX,
      sessionPartnerStatus: 'approved',
      creatorId: 'gym-user',
    });
    expect(r.gymHosted).toBe(true);
  });

  it('keeps the coach as the presenter when a coach hosts at the gym', () => {
    const r = resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'approved', creatorId: COACH });
    expect(r.gymHosted).toBe(false);
  });

  it('falls back to the coach layout when the partner user_id was not selected', () => {
    const r = resolveSessionGym({
      sessionPartner: { ...BULLBOX, user_id: null },
      sessionPartnerStatus: 'approved',
      creatorId: 'gym-user',
    });
    expect(r.gymHosted).toBe(false);
  });

  it('shows nothing at all for an unaffiliated instructor', () => {
    // DoD 1: their card must look exactly as T-UI1/T-UI2 left it.
    const r = resolveSessionGym({ creatorId: COACH, viewerId: COACH });
    expect(r).toEqual({ venue: null, affiliation: null, pending: null, gymHosted: false });
  });
});

describe('presenterGymMark — one gym element, never two', () => {
  const OTHER: SessionGymSource = { ...BULLBOX, id: 'p9', business_name: 'Gym Nueve', user_id: 'other-user' };

  it('prefers the affiliation, because the venue is already bold on the location line', () => {
    const mark = presenterGymMark(
      resolveSessionGym({
        sessionPartner: OTHER,
        sessionPartnerStatus: 'approved',
        creatorPartner: BULLBOX,
        creatorId: COACH,
      })
    );
    expect(mark).toEqual({ gym: expect.objectContaining({ business_name: 'CrossFit BullBox' }), asCoach: true });
  });

  it('falls back to the venue when the coach is on no roster', () => {
    // Today's state: partner_instructors is empty, so this is the live path.
    const mark = presenterGymMark(
      resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'approved', creatorId: COACH })
    );
    expect(mark).toEqual({ gym: expect.objectContaining({ business_name: 'CrossFit BullBox' }), asCoach: false });
  });

  it('prints the gym once, not twice, when venue and affiliation are the same place', () => {
    const mark = presenterGymMark(
      resolveSessionGym({
        sessionPartner: BULLBOX,
        sessionPartnerStatus: 'approved',
        creatorPartner: BULLBOX,
        creatorId: COACH,
      })
    );
    expect(mark?.gym.id).toBe('p1');
    expect(mark?.asCoach).toBe(true);
  });

  it('returns nothing for a gym-hosted session, since GymHostRow is already the gym', () => {
    const mark = presenterGymMark(
      resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'approved', creatorId: 'gym-user' })
    );
    expect(mark).toBeNull();
  });

  it('returns nothing for an unaffiliated instructor at no partner venue', () => {
    expect(presenterGymMark(resolveSessionGym({ creatorId: COACH }))).toBeNull();
  });

  it('returns nothing while a request is pending, since there is no approved identity yet', () => {
    const mark = presenterGymMark(
      resolveSessionGym({ sessionPartner: BULLBOX, sessionPartnerStatus: 'pending', creatorId: COACH, viewerId: COACH })
    );
    expect(mark).toBeNull();
  });
});
