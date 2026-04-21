/**
 * Analytics helper — single entry point for ALL analytics calls.
 *
 * No component should import posthog directly. They import from here.
 * This makes it easy to swap providers or add multiple ones later.
 */

import { getPostHog } from '@/lib/posthog';

// ═══════════════════════════════════════════
// USER IDENTIFICATION
// ═══════════════════════════════════════════

interface UserProfile {
  id: string;
  email?: string;
  name?: string;
  is_instructor: boolean;
  is_admin?: boolean;
  language?: string;
  city?: string;
  neighborhood?: string;
  created_at?: string;
  sessions_completed?: number;
  average_rating?: number;
}

/**
 * Identify a user after login or session restore.
 * Call ONCE when the user is authenticated.
 * PostHog links all subsequent events to this user.
 */
export function identifyUser(profile: UserProfile): void {
  const ph = getPostHog();
  if (!ph) return;

  ph.identify(profile.id, {
    email: profile.email,
    name: profile.name,
    is_instructor: profile.is_instructor,
    is_admin: profile.is_admin || false,
    language: profile.language || 'en',
    city: profile.city || 'Medellín',
    neighborhood: profile.neighborhood,
    created_at: profile.created_at,
    sessions_completed: profile.sessions_completed || 0,
    average_rating: profile.average_rating,
  });
}

/**
 * Reset identity on logout.
 * Ensures the next user on the device isn't linked to the previous one.
 */
export function resetUser(): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.reset();
}

// ═══════════════════════════════════════════
// EVENT TRACKING
// ═══════════════════════════════════════════

type EventName =
  // Onboarding
  | 'signup_started'
  | 'signup_email_submitted' // LR-04: fires when email signup form is POSTed
  | 'signup_completed'
  | 'signup_email_verified' // LR-04: fires on /auth/callback when verification link is clicked
  | 'email_verified' // legacy alias — kept for pre-LR-04 dashboards
  | 'onboarding_started' // LR-04: fires when the OnboardingModal mounts
  | 'onboarding_completed' // LR-04: fires when onComplete() resolves
  | 'onboarding_finished' // legacy alias — kept for pre-LR-04 dashboards
  | 'profile_first_save' // LR-04: fires on the first successful profile save
  | 'profile_completed'

  // Sessions (Athlete)
  | 'session_viewed'
  | 'session_join_clicked' // LR-04: fires when the Join button is pressed, before the RPC attempt
  | 'session_join_succeeded' // LR-04: canonical name for a successful join; session_joined retained below
  | 'session_joined'
  | 'session_join_failed'
  | 'session_left'
  | 'session_completed'
  | 'session_shared'

  // Sessions (Instructor)
  | 'session_created'
  | 'session_edited'
  | 'session_cancelled'
  | 'session_boost_purchased'

  // Payments
  | 'payment_initiated'
  | 'payment_completed'
  | 'payment_failed'
  | 'promo_code_applied'
  | 'promo_code_failed'

  // Products (future — storefront spec)
  | 'product_viewed'
  | 'product_purchased'
  | 'product_created'
  | 'product_order_fulfilled'

  // Social
  | 'connection_requested'
  | 'connection_accepted'
  | 'connection_rejected'
  | 'message_sent'
  | 'community_joined'
  | 'challenge_joined'
  | 'challenge_completed'
  | 'post_created'
  | 'post_liked'
  | 'post_commented'

  // Discovery
  | 'search_executed'
  | 'filter_applied'
  | 'neighborhood_selected'
  | 'instructor_profile_viewed'
  | 'explore_city_tapped'

  // Post-session rating (LR-04 funnel)
  | 'rating_modal_shown'
  | 'rating_submitted'
  | 'rating_submit_failed'

  // Engagement
  | 'notification_received'
  | 'notification_tapped'
  | 'streak_updated'
  | 'app_opened'
  | 'language_changed'
  | 'share_link_created'
  | 'referral_sent'
  | 'session_calendar_added'
  | 'stats_shared'
  | 'tip_sent'
  | 'post_session_rebook'
  | 'spotlight_impression'
  | 'spotlight_clicked'

  // Account
  | 'settings_opened'
  | 'instructor_onboarding_started'
  | 'instructor_onboarding_completed'
  | 'account_deleted'

  // Errors
  | 'error_occurred'
  | 'api_error';

/**
 * Track a named event with optional properties.
 * This is the main function components call.
 */
export function trackEvent(event: EventName, properties?: Record<string, unknown>): void {
  const ph = getPostHog();
  if (!ph) return;

  ph.capture(event, {
    ...properties,
    timestamp: new Date().toISOString(),
    platform: typeof window !== 'undefined' && 'Capacitor' in window ? 'mobile' : 'web',
  });
}

/**
 * Track a timed event (e.g., how long to complete a form).
 * Returns a function that ends the timer and sends the event.
 */
export function startTimedEvent(event: EventName, properties?: Record<string, unknown>): () => void {
  const startTime = Date.now();
  return () => {
    const durationMs = Date.now() - startTime;
    trackEvent(event, {
      ...properties,
      duration_ms: durationMs,
      duration_seconds: Math.round(durationMs / 1000),
    });
  };
}

// ═══════════════════════════════════════════
// PROPERTY UPDATES
// ═══════════════════════════════════════════

/**
 * Update a user property after initial identification.
 * E.g., when they complete a session, update sessions_completed.
 */
export function updateUserProperty(key: string, value: string | number | boolean): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.people?.set({ [key]: value });
}

// ═══════════════════════════════════════════
// SESSION CONTEXT (enriches all events)
// ═══════════════════════════════════════════

/**
 * Register properties that persist across all events in the session.
 * Call when context changes (e.g., user selects a neighborhood filter).
 */
export function setSessionContext(context: Record<string, unknown>): void {
  const ph = getPostHog();
  if (!ph) return;
  ph.register(context);
}
