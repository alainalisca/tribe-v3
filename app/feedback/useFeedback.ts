'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import type { User } from '@supabase/supabase-js';

export function useFeedbackTranslations(language: string) {
  return language === 'es'
    ? {
        pageTitle: 'Ayudanos a Mejorar',
        feedback: 'Comentarios',
        bugReport: 'Reportar Error',
        shareIdeas: 'Comparte Tus Ideas',
        shareIdeasDesc: 'Tienes una solicitud de funcion o comentarios? Nos encantaria escucharte!',
        type: 'Tipo',
        featureRequest: 'Solicitud de Funcion',
        general: 'Comentario General',
        title: 'Titulo',
        titlePlaceholder: 'Breve resumen de tu comentario',
        description: 'Descripcion',
        descriptionPlaceholder: 'Cuentanos mas sobre tu idea...',
        submitFeedback: 'Enviar Comentario',
        submitting: 'Enviando...',
        reportBug: 'Reportar un Error',
        reportBugDesc: 'Encontraste algo roto? Avisanos para que lo podamos arreglar!',
        bugTitlePlaceholder: 'Breve descripcion del error',
        whatHappened: 'Que paso?',
        whatHappenedPlaceholder: 'Describe lo que salio mal...',
        stepsToReproduce: 'Pasos para reproducir (opcional)',
        stepsPlaceholder: '1. Ir a...\n2. Hacer clic en...\n3. Ver error...',
        severity: 'Gravedad',
        low: 'Baja - Problema menor',
        medium: 'Media - Molesto pero usable',
        high: 'Alta - Problema mayor',
        critical: 'Critica - App no funciona',
        submitBug: 'Enviar Reporte',
        fillAll: 'Por favor completa todos los campos',
        fillRequired: 'Por favor completa los campos requeridos',
        feedbackSuccess: 'Comentario enviado! Apreciamos tu aporte.',
        bugSuccess: 'Reporte enviado! Lo investigaremos.',
        loading: 'Cargando...',
      }
    : {
        pageTitle: 'Help Improve',
        feedback: 'Feedback',
        bugReport: 'Bug Report',
        shareIdeas: 'Share Your Ideas',
        shareIdeasDesc: "Have a feature request or general feedback? We'd love to hear from you!",
        type: 'Type',
        featureRequest: 'Feature Request',
        general: 'General Feedback',
        title: 'Title',
        titlePlaceholder: 'Brief summary of your feedback',
        description: 'Description',
        descriptionPlaceholder: 'Tell us more about your idea or feedback...',
        submitFeedback: 'Submit Feedback',
        submitting: 'Submitting...',
        reportBug: 'Report a Bug',
        reportBugDesc: 'Found something broken? Let us know so we can fix it!',
        bugTitlePlaceholder: 'Brief description of the bug',
        whatHappened: 'What happened?',
        whatHappenedPlaceholder: 'Describe what went wrong...',
        stepsToReproduce: 'Steps to reproduce (optional)',
        stepsPlaceholder: '1. Go to...\n2. Click on...\n3. See error...',
        severity: 'Severity',
        low: 'Low - Minor issue',
        medium: 'Medium - Annoying but usable',
        high: 'High - Major problem',
        critical: 'Critical - App is broken',
        submitBug: 'Submit Bug Report',
        fillAll: 'Please fill in all fields',
        fillRequired: 'Please fill in all required fields',
        feedbackSuccess: 'Feedback submitted! We appreciate your input.',
        bugSuccess: "Bug report submitted! We'll investigate this.",
        loading: 'Loading...',
      };
}

export function useFeedback() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'feedback' | 'bug'>('feedback');
  const [submitting, setSubmitting] = useState(false);

  // Feedback form
  const [feedbackType, setFeedbackType] = useState('feature_request');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');

  // Bug report form
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSeverity, setBugSeverity] = useState('medium');

  const t = useFeedbackTranslations(language);

  useEffect(() => {
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function checkUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function submitFeedback() {
    if (!feedbackTitle.trim() || !feedbackDescription.trim()) {
      showInfo(t.fillAll);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_feedback').insert({
        user_id: user!.id,
        type: feedbackType,
        title: feedbackTitle,
        description: feedbackDescription,
      });

      if (error) throw error;

      showSuccess(t.feedbackSuccess);
      setFeedbackTitle('');
      setFeedbackDescription('');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'submit_feedback', language));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBugReport() {
    if (!bugTitle.trim() || !bugDescription.trim()) {
      showInfo(t.fillRequired);
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('bug_reports').insert({
        user_id: user!.id,
        title: bugTitle,
        description: bugDescription,
        steps_to_reproduce: bugSteps,
        severity: bugSeverity,
      });

      if (error) throw error;

      showSuccess(t.bugSuccess);
      setBugTitle('');
      setBugDescription('');
      setBugSteps('');
      setBugSeverity('medium');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'submit_feedback', language));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    user,
    activeTab,
    setActiveTab,
    submitting,
    t,
    router,
    // Feedback form
    feedbackType,
    setFeedbackType,
    feedbackTitle,
    setFeedbackTitle,
    feedbackDescription,
    setFeedbackDescription,
    submitFeedback,
    // Bug report form
    bugTitle,
    setBugTitle,
    bugDescription,
    setBugDescription,
    bugSteps,
    setBugSteps,
    bugSeverity,
    setBugSeverity,
    submitBugReport,
  };
}
