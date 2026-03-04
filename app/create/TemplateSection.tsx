'use client';

import { useState, useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { log, logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import type { Database } from '@/lib/database.types';

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
  const [templates, setTemplates] = useState<SessionTemplateRow[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('session_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) {
        log('warn', 'Templates load failed (non-critical)', { action: 'loadTemplates', error: error.message });
        setTemplates([]);
        return;
      }
      setTemplates(data || []);
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
      showInfo(language === 'es' ? 'Completa deporte y ubicación primero' : 'Fill in sport and location first');
      return;
    }
    const templateName = prompt(
      language === 'es' ? 'Nombre para esta plantilla:' : 'Name for this template:',
      `${formData.sport} - ${formData.location}`
    );
    if (!templateName) return;
    try {
      setSavingTemplate(true);
      const { error } = await supabase.from('session_templates').insert({
        user_id: userId,
        name: templateName,
        sport: formData.sport,
        location: formData.location,
        duration: formData.duration,
        max_participants: formData.max_participants,
        description: formData.description,
      });
      if (error) throw error;
      showSuccess(language === 'es' ? '¡Plantilla guardada!' : 'Template saved!');
      await loadTemplates();
    } catch (error: unknown) {
      logError(error, { action: 'saveAsTemplate' });
      const detail = error instanceof Error ? error.message : String(error);
      showError(language === 'es' ? `Error al guardar plantilla: ${detail}` : `Error saving template: ${detail}`);
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!confirm(language === 'es' ? '¿Eliminar plantilla?' : 'Delete template?')) return;
    try {
      const { error } = await supabase.from('session_templates').delete().eq('id', templateId);
      if (error) throw error;
      loadTemplates();
      showSuccess(language === 'es' ? 'Plantilla eliminada' : 'Template deleted');
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'create_session', language));
    }
  }

  function handleLoadTemplate(template: SessionTemplateRow) {
    onLoadTemplate(template);
    setShowTemplates(false);
    showSuccess(language === 'es' ? 'Plantilla cargada' : 'Template loaded');
  }

  return (
    <>
      <div className="flex gap-3 mb-4">
        <button
          type="button"
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex-1 py-3 px-3 bg-stone-200 dark:bg-[#52575D] text-theme-primary font-medium rounded-lg hover:bg-stone-300 dark:hover:bg-[#6B7178] transition text-sm"
        >
          📋 {language === 'es' ? 'Usar Plantilla' : 'Use Template'} ({templates.length})
        </button>
        <button
          type="button"
          onClick={saveAsTemplate}
          disabled={savingTemplate}
          className="flex-1 py-3 px-3 bg-tribe-green text-slate-900 font-medium rounded-lg hover:bg-lime-500 transition disabled:opacity-50 text-sm"
        >
          {savingTemplate ? '...' : language === 'es' ? '💾 Guardar' : '💾 Save Template'}
        </button>
      </div>

      {showTemplates && templates.length > 0 && (
        <div className="mb-4 bg-white dark:bg-[#6B7178] rounded-lg border border-stone-200 dark:border-[#52575D] p-3">
          <h3 className="text-sm font-bold text-theme-primary mb-2">
            {language === 'es' ? 'Tus Plantillas' : 'Your Templates'}
          </h3>
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
                    {language === 'es' ? 'Usar' : 'Use'}
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
