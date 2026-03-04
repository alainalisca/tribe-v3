'use client';

import { useState, useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { insertTemplate, deleteTemplate as dalDeleteTemplate, fetchTemplatesByUser } from '@/lib/dal';
import type { Database } from '@/lib/database.types';
import { useLanguage } from '@/lib/LanguageContext';

type SessionTemplateRow = Database['public']['Tables']['session_templates']['Row'];

interface TemplateSectionProps {
  supabase: SupabaseClient;
  userId: string;
  language: 'en' | 'es';
  formData: { sport: string; location: string; duration: number; max_participants: number; description: string };
  onLoadTemplate: (template: SessionTemplateRow) => void;
}

export default function TemplateSection({
  supabase,
  userId,
  language,
  formData,
  onLoadTemplate,
}: TemplateSectionProps) {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<SessionTemplateRow[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadTemplates() {
    try {
      const result = await fetchTemplatesByUser(supabase, userId);
      if (!result.success) {
        log('warn', 'Templates load failed (non-critical)', { action: 'loadTemplates', error: result.error });
        setTemplates([]);
        return;
      }
      setTemplates((result.data || []) as SessionTemplateRow[]);
    } catch (error: unknown) {
      log('warn', 'Templates load exception (non-critical)', {
        action: 'loadTemplates',
        error: error instanceof Error ? error.message : String(error),
      });
      setTemplates([]);
    }
  }

  async function saveAsTemplate() {
    if (!formData.sport || !formData.location) {
      showInfo(t('fillSportAndLocation'));
      return;
    }
    const templateName = prompt(t('nameForTemplate'), `${formData.sport} - ${formData.location}`);
    if (!templateName) return;
    try {
      setSavingTemplate(true);
      const result = await insertTemplate(supabase, {
        user_id: userId,
        name: templateName,
        sport: formData.sport,
        location: formData.location,
        duration: formData.duration,
        max_participants: formData.max_participants,
        description: formData.description,
      });
      if (!result.success) throw new Error(result.error);
      showSuccess(t('templateSaved'));
      await loadTemplates();
    } catch (error: unknown) {
      logError(error, { action: 'saveAsTemplate' });
      const detail = error instanceof Error ? error.message : String(error);
      showError(`${t('errorSavingTemplate')}: ${detail}`);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm(t('deleteTemplateConfirm'))) return;
    try {
      const result = await dalDeleteTemplate(supabase, templateId);
      if (!result.success) throw new Error(result.error);
      loadTemplates();
      showSuccess(t('templateDeleted'));
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'create_session', language));
    }
  }

  function handleLoadTemplate(template: SessionTemplateRow) {
    onLoadTemplate(template);
    setShowTemplates(false);
    showSuccess(t('templateLoaded'));
  }

  return (
    <>
      <div className="flex gap-3 mb-4">
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex-1 py-3 px-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178] transition text-sm"
        >
          📋 {t('useTemplate')} ({templates.length})
        </button>
        <button
          type="button"
          onClick={saveAsTemplate}
          disabled={savingTemplate}
          className="flex-1 py-3 px-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500 transition disabled:opacity-50 text-sm"
        >
          {savingTemplate ? '...' : `💾 ${t('saveTemplate')}`}
        </button>
      </div>

      {showTemplates && templates.length > 0 && (
        <div className="mb-4 bg-white dark:bg-[#6B7178] rounded-lg border border-stone-200 dark:border-[#52575D] p-3">
          <h3 className="text-sm font-bold text-theme-primary mb-2">{t('yourTemplates')}</h3>
          <div className="space-y-2">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-2 bg-stone-50 dark:bg-[#52575D] rounded"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-theme-primary">{template.name}</p>
                  <p className="text-xs text-stone-600 dark:text-gray-400">
                    {template.sport} • {template.location} • {template.duration}min
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(template)}
                    className="px-3 py-1 bg-tribe-green text-slate-900 text-xs rounded hover:bg-lime-500"
                  >
                    {t('use')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(template.id)}
                    className="px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs rounded"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
