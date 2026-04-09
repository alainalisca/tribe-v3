// types/feedback.ts
// ============================================================
// Type definitions for the feedback widget feature.
// Aligned with the existing user_feedback table schema.
// ============================================================

/** Feedback categories shown in the widget */
export type FeedbackCategory = 'bug' | 'feature_request' | 'general';

/** Maps to the existing user_feedback.status column */
export type FeedbackStatus = 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'dismissed';

/** Device info collected automatically on submit */
export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  nativePlatform?: string;
}

/** Payload sent from the widget to the API route */
export interface FeedbackSubmitPayload {
  category: FeedbackCategory;
  message: string;
  deviceInfo: DeviceInfo;
  appVersion?: string;
}

/** Response from POST /api/feedback/widget */
export interface FeedbackSubmitResponse {
  success: boolean;
  feedbackId?: string;
  error?: string;
}

/** Category labels for display (bilingual) */
export const FEEDBACK_CATEGORY_LABELS: Record<
  FeedbackCategory,
  { en: string; es: string }
> = {
  bug: { en: 'Bug report', es: 'Reporte de error' },
  feature_request: { en: 'Feature idea', es: 'Idea de función' },
  general: { en: 'General', es: 'General' },
};
