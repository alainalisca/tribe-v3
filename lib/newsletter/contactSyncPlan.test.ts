import { describe, it, expect } from 'vitest';
import { planContactSync, REMOVE_BRAKE_MIN_LIST, type AppMember, type ResendMember } from './contactSyncPlan';

const member = (over: Partial<AppMember> & { userId: string; email: string }): AppMember => ({
  firstName: 'Ana',
  role: 'athlete',
  suppressed: false,
  eligible: true,
  ...over,
});

const contact = (over: Partial<ResendMember> & { contactId: string; email: string }): ResendMember => ({
  unsubscribed: false,
  ...over,
});

describe('planContactSync', () => {
  it('creates a contact for an eligible, unsuppressed user who has none', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com', firstName: 'Ana', role: 'instructor' })],
      []
    );
    expect(plan.create).toEqual([{ email: 'a@x.com', firstName: 'Ana', role: 'instructor' }]);
    expect(plan.pullUnsubscribe).toEqual([]);
    expect(plan.pushUnsubscribe).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.refused).toBeNull();
  });

  it('does nothing when both sides already agree', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com' })],
      [contact({ contactId: 'c1', email: 'a@x.com' })]
    );
    expect(plan).toEqual({ pullUnsubscribe: [], pushUnsubscribe: [], create: [], remove: [], refused: null });
  });

  it('PULL: a newsletter unsubscribe suppresses the app user', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com' })],
      [contact({ contactId: 'c1', email: 'a@x.com', unsubscribed: true })]
    );
    expect(plan.pullUnsubscribe).toEqual(['u1']);
    // and it is not then pushed back, or re-created
    expect(plan.pushUnsubscribe).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('PUSH: an app opt-out unsubscribes the Resend contact', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com', suppressed: true })],
      [contact({ contactId: 'c1', email: 'a@x.com' })]
    );
    expect(plan.pushUnsubscribe).toEqual(['c1']);
    expect(plan.pullUnsubscribe).toEqual([]);
  });

  it('never creates a contact for a suppressed user', () => {
    const plan = planContactSync([member({ userId: 'u1', email: 'a@x.com', suppressed: true })], []);
    expect(plan.create).toEqual([]);
  });

  it('never resubscribes: unsubscribed in Resend, suppressed in the app, nothing to do', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com', suppressed: true })],
      [contact({ contactId: 'c1', email: 'a@x.com', unsubscribed: true })]
    );
    expect(plan).toEqual({ pullUnsubscribe: [], pushUnsubscribe: [], create: [], remove: [], refused: null });
  });

  it('REMOVE: a contact with no matching Tribe user is removed', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com' })],
      [contact({ contactId: 'c1', email: 'a@x.com' }), contact({ contactId: 'c2', email: 'gone@x.com' })]
    );
    expect(plan.remove).toEqual(['c2']);
  });

  it('treats an ineligible user (deleted, banned, test, unconfirmed) as absent', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com', eligible: false })],
      [contact({ contactId: 'c1', email: 'a@x.com' })]
    );
    expect(plan.remove).toEqual(['c1']);
    expect(plan.create).toEqual([]);
  });

  it('does not pull an unsubscribe onto an ineligible user', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: 'a@x.com', eligible: false })],
      [contact({ contactId: 'c1', email: 'a@x.com', unsubscribed: true })]
    );
    expect(plan.pullUnsubscribe).toEqual([]);
  });

  it('matches addresses case-insensitively and ignores surrounding spaces', () => {
    const plan = planContactSync(
      [member({ userId: 'u1', email: ' Ana@X.com ' })],
      [contact({ contactId: 'c1', email: 'ana@x.com', unsubscribed: true })]
    );
    expect(plan.pullUnsubscribe).toEqual(['u1']);
    expect(plan.remove).toEqual([]);
    expect(plan.create).toEqual([]);
  });

  it('creates with the trimmed address, not the raw one', () => {
    const plan = planContactSync([member({ userId: 'u1', email: '  a@x.com ' })], []);
    expect(plan.create[0].email).toBe('a@x.com');
  });

  describe('the removal brake', () => {
    const contacts = (n: number): ResendMember[] =>
      Array.from({ length: n }, (_, i) => contact({ contactId: `c${i}`, email: `p${i}@x.com` }));
    const members = (n: number): AppMember[] =>
      Array.from({ length: n }, (_, i) => member({ userId: `u${i}`, email: `p${i}@x.com` }));

    it('refuses when an empty app read would wipe the list, and says why', () => {
      const plan = planContactSync([], contacts(80));
      expect(plan.refused).toMatch(/would remove 80 of 80/);
      expect(plan.remove).toEqual([]);
      expect(plan.create).toEqual([]);
      expect(plan.pushUnsubscribe).toEqual([]);
    });

    it('still honours newsletter unsubscribes when it refuses', () => {
      const list = contacts(20);
      list[0] = { ...list[0], unsubscribed: true };
      // only p0 is matched on the app side, so 19 of 20 would be removed
      const plan = planContactSync([member({ userId: 'u0', email: 'p0@x.com' })], list);
      expect(plan.refused).not.toBeNull();
      expect(plan.pullUnsubscribe).toEqual(['u0']);
    });

    it('allows ordinary churn under the limit', () => {
      // 80 contacts, 78 still users: 2 removals = 2.5%
      const plan = planContactSync(members(78), contacts(80));
      expect(plan.refused).toBeNull();
      expect(plan.remove).toEqual(['c78', 'c79']);
    });

    it('fires just past the limit, not at it', () => {
      // 20% of 50 = 10. Ten removals is allowed, eleven is not.
      expect(planContactSync(members(40), contacts(50)).refused).toBeNull();
      expect(planContactSync(members(39), contacts(50)).refused).not.toBeNull();
    });

    it('does not apply to a list smaller than the minimum', () => {
      const n = REMOVE_BRAKE_MIN_LIST - 1;
      const plan = planContactSync([], contacts(n));
      expect(plan.refused).toBeNull();
      expect(plan.remove).toHaveLength(n);
    });
  });
});
