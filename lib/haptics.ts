/**
 * Haptic feedback utility.
 * Uses Capacitor Haptics on native, Vibration API on web, silent no-op otherwise.
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export async function haptic(style: HapticStyle = 'light'): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (style === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (style === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (style === 'error') {
        await Haptics.notification({ type: NotificationType.Error });
      } else if (style === 'heavy') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (style === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else {
        await Haptics.impact({ style: ImpactStyle.Light });
      }
      return;
    }
  } catch {
    // Capacitor not available
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    const durations: Record<HapticStyle, number> = {
      light: 10,
      medium: 20,
      heavy: 30,
      success: 15,
      warning: 25,
      error: 40,
    };
    navigator.vibrate(durations[style] || 10);
  }
}
