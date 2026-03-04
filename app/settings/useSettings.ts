/** Hook: useSettings — all settings state, effects, and handler functions */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { log, logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { getSettingsTranslations } from './translations';
import { fetchUserField, fetchUserIsAdmin, deleteUser, updateUser } from '@/lib/dal';
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

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
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
      const deleteResult = await deleteUser(supabase, user!.id);

      if (!deleteResult.success) throw new Error(deleteResult.error);

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
    if (!user) return;

    try {
      const { Capacitor } = await import('@capacitor/core');
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        log('debug', 'Toggling notifications for native user', {
          userId: user.id,
          action: 'toggleNotifications',
        });
        const { registerForPushNotifications } = await import('@/lib/firebase-messaging');
        const success = await registerForPushNotifications(user.id);
        if (success) {
          setNotificationsEnabled(true);
          showSuccess(language === 'en' ? 'Notifications enabled!' : '¡Notificaciones activadas!');
        } else {
          showError(
            language === 'en'
              ? 'Could not enable notifications. Check your device settings.'
              : 'No se pudieron activar las notificaciones. Revisa la configuración de tu dispositivo.'
          );
        }
        return;
      }

      // Web path
      if (!('Notification' in window)) {
        showError('This browser does not support notifications');
        return;
      }

      if (Notification.permission === 'granted') {
        setNotificationsEnabled(false);
        showInfo(language === 'en' ? 'Notifications disabled' : 'Notificaciones desactivadas');
      } else if (Notification.permission !== 'denied') {
        log('debug', 'Requesting web push for user', {
          userId: user.id,
          action: 'toggleNotifications',
        });
        const { registerForPushNotifications } = await import('@/lib/firebase-messaging');
        const success = await registerForPushNotifications(user.id);
        log('debug', 'Web push registration result', {
          success,
          action: 'toggleNotifications',
        });
        if (success) {
          setNotificationsEnabled(true);
          showSuccess(language === 'en' ? 'Notifications enabled!' : '¡Notificaciones activadas!');
        }
      } else {
        showError(
          language === 'en'
            ? 'Notifications are blocked. Please enable them in your browser settings.'
            : 'Las notificaciones están bloqueadas. Por favor actívalas en la configuración de tu navegador.'
        );
      }
    } catch (error) {
      logError(error, { action: 'toggleNotifications' });
      showError(language === 'en' ? 'Error enabling notifications' : 'Error al activar notificaciones');
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
  };
}
