/** Hook: useSettings — all settings state, effects, and handler functions */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { log, logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { getSettingsTranslations } from './translations';
import { fetchUserField, fetchUserIsAdmin, updateUser } from '@/lib/dal';
import { requestUserLocation } from '@/lib/location';
import { resetUser } from '@/lib/analytics';
import type { User } from '@supabase/supabase-js';

export function useSettings(language: 'en' | 'es') {
  const router = useRouter();
  const supabase = createClient();
  const txt = getSettingsTranslations(language);

  const [user, setUser] = useState<User | null>(null);
  const [userIsAdmin, setUserIsAdmin] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [sessionRemindersEnabled, setSessionRemindersEnabled] = useState(true);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [debugRunning, setDebugRunning] = useState(false);
  const [locationPermission, setLocationPermission] = useState<PermissionState | 'unsupported'>('prompt');
  const [loadingLocation, setLoadingLocation] = useState(false);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Check notification permission using native API on Capacitor, web API otherwise,
  // and also check DB for fcm_token as a persistence signal
  useEffect(() => {
    async function checkNotificationStatus() {
      // 1. Check OS-level permission
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { checkNotificationPermission } = await import('@/lib/firebase-messaging');
          const status = await checkNotificationPermission();
          if (status === 'granted') {
            setNotificationsEnabled(true);
            return;
          }
        } else if ('Notification' in window && Notification.permission === 'granted') {
          setNotificationsEnabled(true);
          return;
        }
      } catch {
        // Fall through to DB check
      }

      // 2. Fall back to DB — if user has an fcm_token, they previously enabled notifications
      if (user) {
        const result = await fetchUserField(supabase, user.id, 'fcm_token');
        if (result.success && result.data) {
          setNotificationsEnabled(true);
          return;
        }
      }
    }
    checkNotificationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check when user loads
  }, [user]);

  // Read the current geolocation permission state so the button can reflect it.
  // Runs once on mount; no subscription (state changes on next page visit).
  useEffect(() => {
    async function checkLocationPermission() {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocationPermission('unsupported');
        return;
      }
      if (typeof navigator.permissions?.query === 'function') {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setLocationPermission(status.state);
          status.onchange = () => setLocationPermission(status.state);
        } catch {
          // Permissions API unavailable — leave at default 'prompt'
        }
      }
    }
    checkLocationPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Load user's reminder preference
  useEffect(() => {
    async function loadReminderPreference() {
      if (!user) return;
      const result = await fetchUserField(supabase, user.id, 'session_reminders_enabled');

      if (result.success && result.data !== undefined) {
        setSessionRemindersEnabled(result.data !== false);
      }
    }
    loadReminderPreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only (supabase is stable)
  }, [user]);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      setUserIsAdmin(adminResult.success ? !!adminResult.data : false);
    }
  }

  async function handleSignOut() {
    if (user) {
      try {
        log('debug', 'Removing FCM token on sign out', {
          userId: user.id,
          action: 'handleSignOut',
        });
        const { removeFcmToken } = await import('@/lib/firebase-messaging');
        await removeFcmToken(user.id);
      } catch (error) {
        logError(error, { action: 'handleSignOut', userId: user.id });
      }
    }
    resetUser();
    await supabase.auth.signOut();
    router.push('/auth');
  }

  async function handleDeleteAccount() {
    const confirmWord = language === 'es' ? 'ELIMINAR' : 'DELETE';
    if (deleteInput !== confirmWord) {
      showInfo(language === 'es' ? 'Eliminación cancelada' : 'Deletion cancelled');
      setShowDeleteConfirm(false);
      setDeleteInput('');
      return;
    }

    try {
      // Account deletion runs server-side (/api/account/delete) — auth-user
      // deletion needs the service-role key, which is not available in the
      // browser. The old client-side deleteUser() silently failed that
      // step and left zombie accounts.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await res.json().catch(() => ({ success: false }))) as { success?: boolean; error?: string };
      if (!res.ok || !result.success) throw new Error(result.error ?? 'delete_failed');

      await supabase.auth.signOut();
      showSuccess(language === 'es' ? 'Cuenta eliminada' : 'Account deleted');
      setShowDeleteConfirm(false);
      setDeleteInput('');
      window.location.href = '/auth';
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_settings', language));
    }
  }

  async function toggleSessionReminders() {
    if (!user) return;
    setLoadingReminders(true);
    try {
      const newValue = !sessionRemindersEnabled;
      const updateResult = await updateUser(supabase, user.id, { session_reminders_enabled: newValue });

      if (!updateResult.success) throw new Error(updateResult.error);

      setSessionRemindersEnabled(newValue);
      showSuccess(
        newValue
          ? language === 'es'
            ? 'Recordatorios activados'
            : 'Reminders enabled'
          : language === 'es'
            ? 'Recordatorios desactivados'
            : 'Reminders disabled'
      );
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_settings', language));
    } finally {
      setLoadingReminders(false);
    }
  }

  async function toggleNotifications() {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { registerForPushNotifications } = await import('@/lib/firebase-messaging');
        const token = await registerForPushNotifications(user?.id || '');
        if (token) {
          setNotificationsEnabled(true);
          showSuccess(language === 'en' ? 'Notifications enabled!' : '¡Notificaciones activadas!');
        } else {
          setNotificationsEnabled(false);
          showError(
            language === 'en'
              ? 'Could not enable notifications. Check your device settings.'
              : 'No se pudieron activar las notificaciones. Revisa la configuración de tu dispositivo.'
          );
        }
        return;
      }

      // Web path
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && user?.id) {
          const { requestNotificationPermission } = await import('@/lib/notifications');
          try {
            await requestNotificationPermission(user.id);
            setNotificationsEnabled(true);
            showSuccess(language === 'en' ? 'Notifications enabled!' : '¡Notificaciones activadas!');
          } catch (err) {
            setNotificationsEnabled(false);
            // PUSH_NOT_CONFIGURED → VAPID env var missing in this env. Distinct
            // from generic failure so the user knows it's not their fault.
            if (err instanceof Error && err.message === 'PUSH_NOT_CONFIGURED') {
              showError(
                language === 'en'
                  ? "Push notifications aren't set up on this environment yet. Try again from the production app."
                  : 'Las notificaciones push aún no están configuradas en este entorno. Intenta desde la app de producción.'
              );
            } else {
              throw err;
            }
          }
        } else {
          setNotificationsEnabled(false);
        }
      }
    } catch (error) {
      logError(error, { action: 'toggleNotifications' });
      setNotificationsEnabled(false);
      showError(
        language === 'en'
          ? 'Could not enable notifications. Check your device settings.'
          : 'No se pudieron activar las notificaciones. Revisa la configuración de tu dispositivo.'
      );
    }
  }

  async function runNotificationDiagnostic() {
    setDebugRunning(true);
    const lines: string[] = [];
    const addLine = (line: string) => {
      lines.push(line);
      setDebugInfo([...lines]);
    };

    try {
      const { Capacitor } = await import('@capacitor/core');
      const platform = Capacitor.getPlatform();
      const isNative = Capacitor.isNativePlatform();
      addLine(`Platform: ${platform} (native: ${isNative})`);

      if (!isNative) {
        addLine('Not a native app — FCM diagnostics require native');
        // Show web permission status
        if ('Notification' in window) {
          addLine(`Web permission: ${Notification.permission}`);
        }
        setDebugRunning(false);
        return;
      }

      const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

      // Step 1: Check permissions
      addLine('Checking permissions...');
      const permResult = await FirebaseMessaging.checkPermissions();
      addLine(`Permission: ${permResult.receive}`);

      if (permResult.receive !== 'granted') {
        addLine('Requesting permissions...');
        const reqResult = await FirebaseMessaging.requestPermissions();
        addLine(`After request: ${reqResult.receive}`);
        if (reqResult.receive !== 'granted') {
          addLine('BLOCKED — cannot proceed without permission');
          setDebugRunning(false);
          return;
        }
      }

      // Step 2: Check DB token
      if (user) {
        const dbResult = await fetchUserField(supabase, user.id, 'fcm_token');
        const dbToken = dbResult.success ? (dbResult.data as string | null) : null;
        addLine(`DB token: ${dbToken ? dbToken.substring(0, 20) + '...' : 'null'}`);
      }

      // Step 3: Delete old token
      addLine('Deleting old token...');
      try {
        await FirebaseMessaging.deleteToken();
        addLine('Old token deleted');
      } catch (err) {
        addLine(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Step 4: Get new token
      addLine('Getting new token...');
      const tokenResult = await FirebaseMessaging.getToken();
      const newToken = tokenResult.token;
      addLine(`New token: ${newToken ? newToken.substring(0, 20) + '...' : 'null'}`);

      if (!newToken) {
        addLine('ERROR: getToken returned empty');
        setDebugRunning(false);
        return;
      }

      // Step 5: Save to DB
      if (user) {
        addLine('Saving to DB...');
        const { saveFcmToken } = await import('@/lib/firebase-messaging');
        await saveFcmToken(user.id, newToken);
        addLine('Token saved to DB');
      } else {
        addLine('No user — skipping DB save');
      }

      addLine('Done');
    } catch (err) {
      addLine(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDebugRunning(false);
    }
  }

  async function enableLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showError(txt.locationUnsupportedToast);
      return;
    }
    setLoadingLocation(true);
    try {
      const loc = await requestUserLocation();
      if (loc && user) {
        // Persist location to the user row so the home feed and
        // training-partner search can use it without re-prompting.
        const result = await updateUser(supabase, user.id, {
          location_lat: loc.latitude,
          location_lng: loc.longitude,
        });
        if (!result.success) throw new Error(result.error);
        setLocationPermission('granted');
        showSuccess(txt.locationSuccessToast);
      } else if (!loc) {
        // null return means the user denied, or permission was blocked
        showError(txt.locationDeniedToast);
      }
    } catch (error: unknown) {
      logError(error, { action: 'enableLocation' });
      showError(getErrorMessage(error, 'update_settings', language));
    } finally {
      setLoadingLocation(false);
    }
  }

  function openDeleteConfirm() {
    setDeleteInput('');
    setShowDeleteConfirm(true);
  }

  function closeDeleteConfirm() {
    setShowDeleteConfirm(false);
    setDeleteInput('');
  }

  return {
    txt,
    user,
    userIsAdmin,
    showDeleteConfirm,
    deleteInput,
    setDeleteInput,
    notificationsEnabled,
    sessionRemindersEnabled,
    loadingReminders,
    handleSignOut,
    handleDeleteAccount,
    toggleSessionReminders,
    toggleNotifications,
    openDeleteConfirm,
    closeDeleteConfirm,
    debugInfo,
    debugRunning,
    runNotificationDiagnostic,
    locationPermission,
    loadingLocation,
    enableLocation,
  };
}
