// types/feedback.ts
// ============================================================
// Type definitions for the user feedback feature
// ============================================================

export type FeedbackCategory = 'bug' | 'feature_request' | 'general';

export type FeedbackStatus = 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'dismissed';

export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  /** Capacitor native platform info, if available */
  nativePlatform?: string;
}

export interface UserFeedback {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  message: string;
  screenshot_url: string | null;
  device_info: DeviceInfo;
  app_version: string | null;
  status: FeedbackStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackInsert {
  category: FeedbackCategory;
  message: string;
  screenshot_url?: string | null;
  device_info?: DeviceInfo;
  app_version?: string | null;
}

export interface FeedbackSubmitPayload {
  category: FeedbackCategory;
  message: string;
  screenshotBase64?: string | null;
  deviceInfo: DeviceInfo;
  appVersion?: string;
}

export interface FeedbackSubmitResponse {
  success: boolean;
  feedbackId?: string;
  error?: string;
}

/** Category labels for display (bilingual) */
export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, { en: string; es: string }> = {
  bug: { en: 'Bug report', es: 'Reporte de error' },
  feature_request: { en: 'Feature idea', es: 'Idea de función' },
  general: { en: 'General', es: 'General' },
};
