import { describe, it, expect } from 'vitest';
import { TYPE_META, type NotificationTypeMeta } from './notificationPreferences';
import { SETTINGS_NOTIFICATION_CATEGORIES } from '@/lib/notifications/settingsCategories';

/**
 * The recurrence guard. This is what made six settings toggles inert last time:
 * a category was shown in the UI but gated no notification, or a notification
 * was gated by a category the UI never rendered. Both directions are checked
 * here, derived from the SAME single source of truth the settings page renders
 * from (SETTINGS_NOTIFICATION_CATEGORIES), so a hand copy cannot drift.
 */

// A type "consults" its category only on a channel whose policy is not
// `required` (required never reads the category). So a category is genuinely
// gated by a type when the type carries it AND at least one channel reads it.
function typeConsultsCategory(meta: NotificationTypeMeta): boolean {
  return meta.push !== 'required' || meta.email !== 'required';
}

describe('notification gating invariant (UI categories <-> TYPE_META)', () => {
  const uiCategoryKeys = SETTINGS_NOTIFICATION_CATEGORIES.map((c) => c.key);
  const uiCategories = new Set<string>(uiCategoryKeys);

  it('the settings UI lists each category exactly once (no accidental duplicate)', () => {
    expect(uiCategoryKeys.length).toBe(uiCategories.size);
  });

  it('every category shown in the settings UI gates at least one type', () => {
    for (const cat of uiCategoryKeys) {
      const gated = Object.values(TYPE_META).some((m) => m.category === cat && typeConsultsCategory(m));
      expect(gated, `Settings category "${cat}" gates no notification type, so the toggle is inert.`).toBe(true);
    }
  });

  it('every type category is a category the settings UI renders', () => {
    for (const [type, meta] of Object.entries(TYPE_META)) {
      if (meta.category === null) continue; // receipts have no user toggle by design
      expect(
        uiCategories.has(meta.category),
        `Type "${type}" is gated by category "${meta.category}", which the settings UI does not render, so the user cannot control it.`
      ).toBe(true);
    }
  });
});
