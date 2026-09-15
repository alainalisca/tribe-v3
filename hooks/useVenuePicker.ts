'use client';

/**
 * Attaching a gym venue to a session (T-GYM2).
 *
 * Everything that is hard about the venue flow lives here, once: the RPC call,
 * the status it returns, the failure message, and the clearing path. The create
 * page (790 lines) and useEditSession (342) are both already over the file
 * limit, and building this into each would duplicate all four across two
 * oversized files (Al, 2026-09-11). They each gain an import, a state line and
 * a mount.
 *
 * THE STATUS IS NEVER SENT FROM HERE. set_session_partner computes it in the
 * database -- the gym's own account is approved, an active roster member is
 * approved while auto_approve_roster is on, everyone else is pending -- and
 * `authenticated` holds no UPDATE privilege on the verdict columns. This hook
 * reports what the database decided; it does not decide anything.
 *
 * FAILURE IS NOT AN EXCEPTION. On create, the session is inserted BEFORE this
 * runs, so a thrown error would land in the create page's catch block and tell
 * the instructor "session creation failed" about a session that exists. The
 * link failing must read as exactly what it is: the session saved, the venue
 * did not attach, and it can be set from the edit form.
 */
import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { setSessionPartner, type GymIdentity } from '@/lib/dal/gymVenue';
import { trackEvent } from '@/lib/analytics';
import { createNotification } from '@/lib/dal/notifications';
import { fetchUserProfileMaybe } from '@/lib/dal/users';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';

/** What the database decided, once a venue has been attached. */
export type VenueStatus = 'approved' | 'pending' | null;

export interface VenueLinkResult {
  /** False only when the session saved but the venue did not attach. */
  ok: boolean;
  status: VenueStatus;
  /** Present when ok is false. Already translated by the caller's message key. */
  errorKey?: 'venueLinkFailed';
}

export interface UseVenuePickerResult {
  /** The gym the instructor has chosen, before or after saving. */
  selected: GymIdentity | null;
  select: (gym: GymIdentity | null) => void;
  /** True while the RPC is in flight. */
  linking: boolean;
  /** The database's verdict on the last successful link. */
  status: VenueStatus;
  /** Set when the session saved but the link did not. */
  failed: boolean;
  /**
   * Attach (or clear) the venue on a session that already exists. Safe to call
   * with no selection: it clears, which is a no-op on an unlinked session.
   */
  /** `sessionTitle` only shapes the gym's notification text. */
  commit: (sessionId: string, sessionTitle?: string) => Promise<VenueLinkResult>;
  reset: () => void;
}

export function useVenuePicker(initial: GymIdentity | null = null): UseVenuePickerResult {
  const tNotif = useTranslations('notif');
  const [selected, setSelected] = useState<GymIdentity | null>(initial);
  const [linking, setLinking] = useState(false);
  const [status, setStatus] = useState<VenueStatus>(null);
  const [failed, setFailed] = useState(false);

  const select = useCallback((gym: GymIdentity | null) => {
    setSelected(gym);
    // A new choice invalidates the previous verdict; showing "pending" for a
    // gym the instructor just swapped away from would be a lie.
    setStatus(null);
    setFailed(false);
  }, []);

  const reset = useCallback(() => {
    setSelected(null);
    setStatus(null);
    setFailed(false);
  }, []);

  const commit = useCallback(
    async (sessionId: string, sessionTitle = ''): Promise<VenueLinkResult> => {
      setLinking(true);
      setFailed(false);
      try {
        const supabase = createClient();
        // null clears all three columns. The RPC is the only writer.
        const result = await setSessionPartner(supabase, sessionId, selected?.id ?? null);

        if (!result.success) {
          logError(new Error(result.error ?? 'venue_link_failed'), {
            action: 'useVenuePicker.commit',
            sessionId,
            partnerId: selected?.id ?? null,
          });
          setFailed(true);
          return { ok: false, status: null, errorKey: 'venueLinkFailed' };
        }

        const next = (result.data ?? null) as VenueStatus;
        setStatus(next);

        if (selected) {
          trackEvent('venue_selected', {
            session_id: sessionId,
            partner_id: selected.id,
            auto_approved: next === 'approved',
          });

          // Only a pending link is news to the gym. An approved one needs no
          // bell: the gym already said yes, either by being the host or by
          // leaving auto-approve on for its roster.
          if (next === 'pending' && selected.user_id) {
            // The message is STORED, not rendered per type: the notifications
            // page prints notification.message verbatim and has no per-type
            // case. Storing a bare business name is why the gym's bell arrived
            // unreadable -- it showed "CrossFit BullBox" and nothing else.
            const {
              data: { user },
            } = await supabase.auth.getUser();
            // fetchUserForNotification is push-delivery data and carries no name.
            const lookup = user?.id ? await fetchUserProfileMaybe(supabase, user.id) : null;
            // fetchUserProfileMaybe takes a dynamic field list, so its data is
            // loosely typed; narrow rather than assert.
            const rawName = lookup?.success ? (lookup.data as { name?: unknown } | null)?.name : undefined;
            const instructorName = typeof rawName === 'string' && rawName.trim() ? rawName : null;

            const notified = await createNotification(supabase, {
              recipient_id: selected.user_id,
              actor_id: user?.id ?? null,
              type: 'venue_request_new',
              entity_type: 'session',
              entity_id: sessionId,
              message: tNotif('venueRequestNew', {
                instructor: instructorName ?? tNotif('anInstructor'),
                title: sessionTitle || tNotif('aSession'),
                gym: selected.business_name,
              }),
            });
            if (!notified.success) {
              // The request exists and the gym will see it in its queue. A
              // missing bell must not make the instructor think the link failed.
              logError(new Error(notified.error ?? 'notify_failed'), {
                action: 'useVenuePicker.notifyGym',
                sessionId,
              });
            }
          }
        }
        return { ok: true, status: next };
      } catch (error) {
        // setSessionPartner already returns DalResult rather than throwing, so
        // reaching here means something below it did -- a network failure, a
        // client that would not construct. "Never throws" has to hold for those
        // too: the caller's catch block is the create page's, and it says
        // "session creation failed" about a session that exists.
        logError(error, { action: 'useVenuePicker.commit', sessionId });
        setFailed(true);
        return { ok: false, status: null, errorKey: 'venueLinkFailed' };
      } finally {
        setLinking(false);
      }
    },
    [selected, tNotif]
  );

  return { selected, select, linking, status, failed, commit, reset };
}
