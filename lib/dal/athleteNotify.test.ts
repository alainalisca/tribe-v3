/** T-AV27b: the two 8209 claims, their exact RPC names and arguments, and the mapping. */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
import { claimDoorNotifications, claimLeadNotification } from './athleteNotify';

const client = (answer: { data: unknown; error: unknown }) => {
  const rpc = vi.fn(async () => answer);
  return { c: { rpc } as unknown as SupabaseClient, rpc };
};

describe('claimDoorNotifications', () => {
  it('calls av_athletes_claim_notification and maps each decided notification', async () => {
    const { c, rpc } = client({
      data: {
        success: true,
        notifications: [
          {
            event: 'arrived',
            recipient_id: 'u3',
            language: 'en',
            push: true,
            guest_first_name: 'Marta',
            partner_name: 'BB',
            partner_id: 'p',
            lead_id: 'l',
          },
          { event: 'bogus', recipient_id: 'x' },
        ],
      },
      error: null,
    });
    const r = await claimDoorNotifications(c, 'AV-CARB', 'arrived');
    expect(rpc).toHaveBeenCalledWith('av_athletes_claim_notification', { p_pass_code: 'AV-CARB', p_event: 'arrived' });
    expect(r).toEqual({
      success: true,
      data: [
        {
          event: 'arrived',
          recipientId: 'u3',
          language: 'en',
          push: true,
          guestFirstName: 'Marta',
          athleteFirstName: null,
          partnerName: 'BB',
          partnerId: 'p',
          leadId: 'l',
        },
      ],
    });
  });

  it("passes the function's refusal word through", async () => {
    const { c } = client({ data: { success: false, error: 'not_happened' }, error: null });
    expect(await claimDoorNotifications(c, 'AV-CARA', 'arrived')).toEqual({ success: false, error: 'not_happened' });
  });
});

describe('claimLeadNotification', () => {
  it('calls av_athletes_claim_lead_notification with the lead id', async () => {
    const { c, rpc } = client({ data: { success: true, notifications: [] }, error: null });
    expect(await claimLeadNotification(c, 'lead-1')).toEqual({ success: true, data: [] });
    expect(rpc).toHaveBeenCalledWith('av_athletes_claim_lead_notification', { p_lead_id: 'lead-1' });
  });
});
