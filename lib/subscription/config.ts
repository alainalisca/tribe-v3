/** Tribe+ subscription tier configuration and helpers. */

export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface TierFeatures {
  /** Percent discount on platform booking fee (100 = fee waived). */
  bookingFeeDiscount: number;
  /** Sees sessions during their early-access window. */
  earlyAccess: boolean;
  /** Can see/book Tribe+ exclusive sessions. */
  exclusiveSessions: boolean;
  /** Unlocks advanced "Insights" on My Training. */
  advancedStats: boolean;
  /** Instructor-only: monthly reach budget for lead discovery (0 = not an instructor benefit here). */
  interestReachesPerMonth: number;
  /** Show ✦ badge next to the user's name. */
  badgeVisible: boolean;
  /** Priority support queue. */
  prioritySupport: boolean;
}

export interface SubscriptionTierConfig {
  name: string;
  nameEs: string;
  /** Monthly price in minor units (cents for USD, pesos for COP). */
  price: { COP: number; USD: number };
  /** Annual price in minor units, if available. */
  priceAnnual?: { COP: number; USD: number };
  features: TierFeatures;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionTier, SubscriptionTierConfig> = {
  free: {
    name: 'Free',
    nameEs: 'Gratis',
    price: { COP: 0, USD: 0 },
    features: {
      bookingFeeDiscount: 0,
      earlyAccess: false,
      exclusiveSessions: false,
      advancedStats: false,
      interestReachesPerMonth: 0,
      badgeVisible: false,
      prioritySupport: false,
    },
  },
  plus: {
    name: 'Tribe+',
    nameEs: 'Tribe+',
    price: { COP: 29900, USD: 750 },
    priceAnnual: { COP: 249900, USD: 6300 },
    features: {
      bookingFeeDiscount: 100,
      earlyAccess: true,
      exclusiveSessions: true,
      advancedStats: true,
      interestReachesPerMonth: 0,
      badgeVisible: true,
      prioritySupport: true,
    },
  },
  pro: {
    name: 'Tribe Pro',
    nameEs: 'Tribe Pro',
    price: { COP: 49900, USD: 1250 },
    features: {
      bookingFeeDiscount: 100,
      earlyAccess: true,
      exclusiveSessions: true,
      advancedStats: true,
      interestReachesPerMonth: 0,
      badgeVisible: true,
      prioritySupport: true,
    },
  },
};

export interface SubscriptionUserFields {
  subscription_tier?: string | null;
  subscription_expires_at?: string | null;
}

/** Whether the given user currently has an active Tribe+ subscription. */
export function isPlus(user: SubscriptionUserFields | null | undefined): boolean {
  if (!user) return false;
  if (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro') return false;
  const expiry = user.subscription_expires_at ? new Date(user.subscription_expires_at) : null;
  if (!expiry) return true; // treat "no expiry" as active
  return expiry > new Date();
}

/** Effective platform-fee multiplier for a user (1 = full fee, 0 = waived). */
export function feeMultiplierForUser(user: SubscriptionUserFields | null | undefined): number {
  if (!isPlus(user)) return 1;
  const tier = (user?.subscription_tier ?? 'free') as SubscriptionTier;
  const discount = SUBSCRIPTION_TIERS[tier]?.features.bookingFeeDiscount ?? 0;
  return Math.max(0, (100 - discount) / 100);
}
