'use client';

/**
 * "Primera clase gratis" on a partner storefront (T-LEAD2).
 *
 * T-LEAD1 shipped the pass with exactly one way in: a QR on a printed voucher
 * inside the gym. Everybody already using Tribe -- the warmest audience the
 * offer has -- saw nothing. This is the in-app front door.
 *
 * SECONDARY, NOT PRIMARY. The storefront's job is still to get someone into a
 * session; a free first class is the alternative for a person not ready to
 * book. Rendering this as loud as the booking CTA would sell the giveaway over
 * the product.
 *
 * HIDDEN FROM THE OWNER. Leo opening his own storefront should not be invited
 * to claim his own gym's free class. The page already computes ownership for
 * the copy-link control, so this costs nothing -- see the isOwner prop, wired
 * from `isOwn` in app/storefront/[id]/page.tsx.
 *
 * SAME TAB. The pass page carries its own way back into Tribe (the storefront
 * return button the claim response builds), so opening a second tab would leave
 * a dead one behind on a phone.
 *
 * NOT MOUNTED INSIDE GymStorefrontHeader, deliberately. That header renders
 * only for business_type gym/studio, so living there would have made the entry
 * point organisation-only -- the pass gate is pass_active and has nothing to do
 * with business_type. The single call site is app/storefront/[id]/page.tsx,
 * below both header branches, so an independent trainer with a pass is covered
 * by the same code path a gym is.
 */
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { trackEvent } from '@/lib/analytics';
import { haptic } from '@/lib/haptics';
import { PASS_ENTRY_CODES, hasClaimablePass, passEntryUrl, type PassEntryPartner } from '@/lib/pase/entryPoint';

interface Props {
  /** The resolved featured_partners row. Only slug and pass_active are read. */
  partner: PassEntryPartner;
  /** Shown in the sub-label: "Deja tu WhatsApp y {partner} te escribe". */
  partnerName: string;
  /** True when the signed-in viewer owns this storefront. */
  isOwner?: boolean;
}

export default function PassEntryButton({ partner, partnerName, isOwner }: Props) {
  const t = useTranslations('partner');

  // Two independent reasons to render nothing, and they are kept separate on
  // purpose: "this partner has no pass" is a property of the row, "you are the
  // owner" is a property of the viewer. Collapsing them into one condition is
  // how a later change to one silently alters the other.
  if (!hasClaimablePass(partner)) return null;
  if (isOwner) return null;

  const href = passEntryUrl(partner.slug as string, PASS_ENTRY_CODES.storefront);

  return (
    <div className="mt-3">
      <Link
        href={href}
        onClick={() => {
          haptic('light');
          trackEvent('pass_entry_tapped', { surface: 'storefront', code: PASS_ENTRY_CODES.storefront });
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-tribe-green bg-transparent px-4 py-3 text-sm font-bold text-theme-primary transition hover:bg-tribe-green/10"
      >
        {/* Green as a border and an icon, never as the label itself: no green
            in the palette clears AA as small text on a light surface. The
            label is text-theme-primary, which is tribe-dark on light. */}
        <Ticket className="w-4 h-4 text-tribe-green-dark" aria-hidden="true" />
        {t('passCta')}
      </Link>
      <p className="mt-1 text-center text-xs text-theme-tertiary">{t('passCtaSub', { partner: partnerName })}</p>
    </div>
  );
}
