/**
 * Who a notification is FROM, in the avatar slot and in the sender line.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE: AN ACTOR_ID MEANS A PERSON. A TYPE ICON MEANS TRIBE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Migration 195 stopped a signed-in user forging `actor_id`, so a bell can no
 * longer claim to come from someone else. It did NOT stop a bell from looking
 * like it came from nobody -- which is worse, because "nobody" reads as Tribe.
 *
 * The page used to render:
 *
 *     actor?.avatar_url ? <img> : TYPE_ICONS[type]
 *
 * so ANY user who had not uploaded a photo produced a notification wearing the
 * system icon, with an attacker-chosen message beside it. The account was
 * honestly recorded in `actor_id` the whole time; the UI simply never drew it.
 * A CSP-style fix at the database cannot reach this, because nothing about the
 * ROW is wrong.
 *
 * So the slot is decided by `actor_id`, and the fallback for a missing photo
 * is initials -- never the type icon.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IT KEYS ON actor_id, NOT ON THE JOINED `actor` OBJECT, AND THAT IS THE
 * WHOLE POINT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `NotificationWithActor.actor` is a LEFT JOIN and is independently nullable:
 * the actor may be soft-deleted, banned, or simply unreadable under the column
 * grants on `public.users`. Keying the branch on `actor` would send every one
 * of those rows straight back to the type icon -- reopening the exact gap this
 * component exists to close, for the subset of accounts most likely to be
 * abusive.
 *
 * `actor_id IS NOT NULL` is a fact about the row. `actor` is a fact about
 * whether a join succeeded. Only the first one answers "was there a person".
 * When the id is present and the profile is not, we draw `?` and a neutral
 * label: still visibly a person, still not Tribe.
 */
'use client';

import type { NotificationWithActor } from '@/lib/dal/notifications';
import { initialsFromName } from '@/lib/avatar';
import { TYPE_ICONS } from './typeIcons';

/** The fields the sender rules actually read. Narrower than the row on purpose. */
export type SenderFields = Pick<NotificationWithActor, 'actor_id' | 'type' | 'actor'>;

/**
 * True when the notification came from a person.
 *
 * Exported so the rule is assertable on its own, and so a caller can never
 * re-derive it slightly differently somewhere else.
 */
export function hasHumanSender(n: Pick<SenderFields, 'actor_id'>): boolean {
  return n.actor_id !== null && n.actor_id !== undefined;
}

/**
 * The name to show beside the message, or null for a system notification.
 *
 * Takes the ALREADY-TRANSLATED fallback label rather than a language code.
 * Two reasons, and the second is the one that matters: this has to stay a pure
 * function so the tests can assert it without mounting a LanguageProvider, and
 * `useTranslations` is a hook so it cannot be called here -- which would have
 * left an inline `language === 'es' ? ...` ternary that the repo's own lint
 * rule is phasing out. Resolving it at the call site keeps the copy in
 * messages/{en,es}.json where the i18n guards can see it, instead of in a
 * string literal only this file knows about.
 */
export function senderName(n: SenderFields, unknownSenderLabel: string): string | null {
  if (!hasHumanSender(n)) return null;
  const name = n.actor?.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  // actor_id present, profile not readable. Still a person, still not Tribe.
  return unknownSenderLabel;
}

export default function NotificationSender({
  notification,
  unknownSenderLabel,
}: {
  notification: SenderFields;
  /** Already translated by the caller; see senderName above. */
  unknownSenderLabel: string;
}) {
  if (!hasHumanSender(notification)) {
    // System / self notification: the type icon is correct here and only here.
    return (
      <div
        data-testid="notification-type-icon"
        className="w-10 h-10 rounded-full bg-stone-100 dark:bg-tribe-mid flex items-center justify-center flex-shrink-0 mt-0.5"
      >
        {TYPE_ICONS[notification.type] || TYPE_ICONS.general}
      </div>
    );
  }

  const name = senderName(notification, unknownSenderLabel);
  const avatarUrl = notification.actor?.avatar_url;

  if (typeof avatarUrl === 'string' && avatarUrl.trim()) {
    return (
      <div className="w-10 h-10 rounded-full bg-stone-100 dark:bg-tribe-mid flex items-center justify-center flex-shrink-0 mt-0.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-testid="notification-actor-avatar"
          src={avatarUrl}
          alt={name ?? ''}
          className="w-10 h-10 rounded-full object-cover"
        />
      </div>
    );
  }

  // No photo. Initials, NOT the type icon -- this branch is the defect.
  // text-tribe-dark on a light green fill: CLAUDE.md measures every green in
  // the palette as failing AA for small text on light, so the green is the
  // background and the dark token is the text.
  return (
    <div
      data-testid="notification-actor-initials"
      aria-label={name ?? undefined}
      className="w-10 h-10 rounded-full bg-tribe-green/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-sm font-bold text-tribe-dark"
    >
      {initialsFromName(name)}
    </div>
  );
}
