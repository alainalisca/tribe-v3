'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { MessageSquare, Bug, ArrowLeft, Send } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';

export default function FeedbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const [user, setUser] = useState<any>(null);
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

  const t = language === 'es' ? {
    pageTitle: 'Ayúdanos a Mejorar',
    feedback: 'Comentarios',
    bugReport: 'Reportar Error',
    shareIdeas: 'Comparte Tus Ideas',
    shareIdeasDesc: '¿Tienes una solicitud de función o comentarios? ¡Nos encantaría escucharte!',
    type: 'Tipo',
    featureRequest: 'Solicitud de Función',
    general: 'Comentario General',
    title: 'Título',
    titlePlaceholder: 'Breve resumen de tu comentario',
    description: 'Descripción',
    descriptionPlaceholder: 'Cuéntanos más sobre tu idea...',
    submitFeedback: 'Enviar Comentario',
    submitting: 'Enviando...',
    reportBug: 'Reportar un Error',
    reportBugDesc: '¿Encontraste algo roto? ¡Avísanos para que lo podamos arreglar!',
    bugTitlePlaceholder: 'Breve descripción del error',
    whatHappened: '¿Qué pasó?',
    whatHappenedPlaceholder: 'Describe lo que salió mal...',
    stepsToReproduce: 'Pasos para reproducir (opcional)',
    stepsPlaceholder: '1. Ir a...\n2. Hacer clic en...\n3. Ver error...',
    severity: 'Gravedad',
    low: 'Baja - Problema menor',
    medium: 'Media - Molesto pero usable',
    high: 'Alta - Problema mayor',
    critical: 'Crítica - App no funciona',
    submitBug: 'Enviar Reporte',
    fillAll: 'Por favor completa todos los campos',
    fillRequired: 'Por favor completa los campos requeridos',
    feedbackSuccess: '¡Comentario enviado! Apreciamos tu aporte.',
    bugSuccess: '¡Reporte enviado! Lo investigaremos.',
    loading: 'Cargando...',
  } : {
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

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
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
      const { error } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          type: feedbackType,
          title: feedbackTitle,
          description: feedbackDescription,
        });

      if (error) throw error;

      showSuccess(t.feedbackSuccess);
      setFeedbackTitle('');
      setFeedbackDescription('');
    } catch (error: any) {
      showError('Error: ' + error.message);
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
      const { error } = await supabase
        .from('bug_reports')
        .insert({
          user_id: user.id,
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
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{t.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      {/* Header */}
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <button onClick={() => router.back()} className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-xl font-bold text-theme-primary">{t.pageTitle} <span className="text-tribe-green">Tribe.</span></h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-theme">
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'feedback'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {t.feedback}
          </button>
          <button
            onClick={() => setActiveTab('bug')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'bug'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            <Bug className="w-5 h-5" />
            {t.bugReport}
          </button>
        </div>

        {/* Feedback Form */}
        {activeTab === 'feedback' && (
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-bold text-theme-primary mb-4">{t.shareIdeas}</h2>
            <p className="text-sm text-theme-secondary mb-6">
              {t.shareIdeasDesc}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t.type} *</label>
                <select
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                >
                  <option value="feature_request">{t.featureRequest}</option>
                  <option value="general">{t.general}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.title} *</label>
                <input
                  type="text"
                  value={feedbackTitle}
                  onChange={(e) => setFeedbackTitle(e.target.value)}
                  placeholder={t.titlePlaceholder}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.description} *</label>
                <textarea
                  value={feedbackDescription}
                  onChange={(e) => setFeedbackDescription(e.target.value)}
                  placeholder={t.descriptionPlaceholder}
                  className="w-full p-3 border border-stone-300 rounded-lg h-32 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                />
              </div>

              <button
                onClick={submitFeedback}
                disabled={submitting}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                {submitting ? t.submitting : t.submitFeedback}
              </button>
            </div>
          </div>
        )}

        {/* Bug Report Form */}
        {activeTab === 'bug' && (
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-bold text-theme-primary mb-4">{t.reportBug}</h2>
            <p className="text-sm text-theme-secondary mb-6">
              {t.reportBugDesc}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t.title} *</label>
                <input
                  type="text"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder={t.bugTitlePlaceholder}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.whatHappened} *</label>
                <textarea
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  placeholder={t.whatHappenedPlaceholder}
                  className="w-full p-3 border border-stone-300 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.stepsToReproduce}</label>
                <textarea
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  placeholder={t.stepsPlaceholder}
                  className="w-full p-3 border border-stone-300 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t.severity} *</label>
                <select
                  value={bugSeverity}
                  onChange={(e) => setBugSeverity(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900"
                >
                  <option value="low">{t.low}</option>
                  <option value="medium">{t.medium}</option>
                  <option value="high">{t.high}</option>
                  <option value="critical">{t.critical}</option>
                </select>
              </div>

              <button
                onClick={submitBugReport}
                disabled={submitting}
                className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Bug className="w-5 h-5" />
                {submitting ? t.submitting : t.submitBug}
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
