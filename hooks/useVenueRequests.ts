'use client';

/**
 * The gym's approval queue (T-GYM2).
 *
 * Only the gym's own account reaches this: the dashboard redirects non-partners
 * away, but the real enforcement is review_venue_request, which checks
 * featured_partners.user_id against auth.uid() inside the database. A creator
 * calling it for their own session is refused there, not here.
 *
 * The instructor is notified in-app on both verdicts. That write is a bell to
 * another person, which createNotification already handles -- RLS denies the
 * RETURNING read on a cross-user insert, and a blocked RETURNING rolls the
 * INSERT back with it, so the helper never reads the row back.
 *
 * Push is deliberately absent: it needs a user-facing wrapper route per
 * direction, modelled on the 191-line notify-approval handler, which is past
 * the "small addition" test the spec set. Written up as a follow-up.
 */
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchVenueRequests } from '@/lib/dal/venueRequests';
import { reviewVenueRequest, setAutoApproveRoster, type VenueRequest } from '@/lib/dal/gymVenue';
import { createNotification } from '@/lib/dal/notifications';
import { trackEvent } from '@/lib/analytics';
import { logError } from '@/lib/logger';

export type VenueDecision = 'approved' | 'declined';

interface UseVenueRequestsArgs {
  partnerId: string;
  gymName: string;
  /** The gym's own user id, so the bell is attributed to it. */
  gymUserId: string;
  initialAutoApprove: boolean;
}

export interface UseVenueRequestsResult {
  requests: VenueRequest[];
  loading: boolean;
  /** Session id currently being decided, so one row can show a spinner. */
  deciding: string | null;
  autoApprove: boolean;
  decide: (request: VenueRequest, decision: VenueDecision) => Promise<boolean>;
  toggleAutoApprove: (next: boolean) => Promise<boolean>;
}

export function useVenueRequests({
  partnerId,
  gymName,
  gymUserId,
  initialAutoApprove,
}: UseVenueRequestsArgs): UseVenueRequestsResult {
  const [requests, setRequests] = useState<VenueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState(initialAutoApprove);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchVenueRequests(createClient(), partnerId);
      if (cancelled) return;
      if (!result.success || !result.data) {
        // An empty queue and an unreadable queue look the same on screen, so
        // the error is logged rather than shown: the gym is not blocked, and a
        // failure here costs visibility of requests, not the requests.
        logError(new Error(result.error ?? 'venue_requests_unavailable'), {
          action: 'useVenueRequests.load',
          partnerId,
        });
        setLoading(false);
        return;
      }
      setRequests(result.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId]);

  const decide = useCallback(
    async (request: VenueRequest, decision: VenueDecision): Promise<boolean> => {
      setDeciding(request.sessionId);
      try {
        const supabase = createClient();
        const result = await reviewVenueRequest(supabase, request.sessionId, decision);
        if (!result.success) {
          logError(new Error(result.error ?? 'review_failed'), {
            action: 'useVenueRequests.decide',
            sessionId: request.sessionId,
            decision,
          });
          return false;
        }

        // Gone from the queue either way: approved sessions now carry the gym,
        // declined ones keep publishing with the plain address.
        setRequests((prev) => prev.filter((r) => r.sessionId !== request.sessionId));

        if (request.instructor) {
          const notified = await createNotification(supabase, {
            recipient_id: request.instructor.id,
            actor_id: gymUserId,
            type: decision === 'approved' ? 'venue_request_approved' : 'venue_request_declined',
            entity_type: 'session',
            entity_id: request.sessionId,
            message: `${gymName}|${request.title ?? request.sport}`,
          });
          if (!notified.success) {
            // The verdict is already recorded; a missing bell must not undo it
            // or make the gym think the decision failed.
            logError(new Error(notified.error ?? 'notify_failed'), {
              action: 'useVenueRequests.notify',
              sessionId: request.sessionId,
            });
          }
        }

        // No latency property. The only timestamp available is the session's
        // created_at, which is exact when the venue was chosen at creation and
        // an overestimate when it was attached later from the edit form -- with
        // nothing in the row telling the two apart. A metric that gets plotted
        // and believed while being wrong in an unmeasurable direction is worse
        // than none (Al, 2026-09-11). The honest fix is a partner_requested_at
        // column written by set_session_partner; noted as a follow-up.
        trackEvent(decision === 'approved' ? 'venue_request_approved' : 'venue_request_declined', {
          partner_id: partnerId,
          session_id: request.sessionId,
          decision,
        });
        return true;
      } finally {
        setDeciding(null);
      }
    },
    [partnerId, gymName, gymUserId]
  );

  const toggleAutoApprove = useCallback(
    async (next: boolean): Promise<boolean> => {
      // Optimistic: the control is a switch and should not lag behind the tap.
      setAutoApprove(next);
      const result = await setAutoApproveRoster(createClient(), partnerId, next);
      if (!result.success) {
        setAutoApprove(!next);
        logError(new Error(result.error ?? 'auto_approve_failed'), {
          action: 'useVenueRequests.toggleAutoApprove',
          partnerId,
        });
        return false;
      }
      return true;
    },
    [partnerId]
  );

  return { requests, loading, deciding, autoApprove, decide, toggleAutoApprove };
}
