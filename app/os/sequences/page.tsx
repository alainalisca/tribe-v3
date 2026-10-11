'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Button, Badge } from '@/components/tribe-os/ui';
import { STEP_CHANNEL_LABELS } from '@/lib/tribe-os/sequences/helpers';
import type { DraftCase } from '@/lib/tribe-os/drafts/templates';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

const TEMPLATE_OPTIONS: { value: DraftCase | ''; label: { en: string; es: string } }[] = [
  { value: '', label: { en: 'None', es: 'Ninguna' } },
  { value: 'plan_expired', label: { en: 'Plan expired', es: 'Plan vencido' } },
  { value: 'plan_expiring', label: { en: 'Plan expiring', es: 'Plan por vencer' } },
  { value: 'absent', label: { en: 'Absent', es: 'Ausente' } },
  { value: 'visiting_less', label: { en: 'Visiting less', es: 'Viene menos' } },
  { value: 'new_not_coming', label: { en: 'New, not coming', es: 'Nuevo, no viene' } },
  { value: 'generic', label: { en: 'Generic', es: 'General' } },
];

const CHANNEL_OPTIONS = ['whatsapp', 'call', 'in_person', 'other'] as const;

const copy = {
  en: {
    pageTitle: 'Sequences',
    subtitle: 'Follow-up sequences for at-risk members',
    loading: 'Loading',
    redirecting: 'Redirecting',
    newSequence: 'New sequence',
    noSequences: 'No sequences yet. Create one to get started.',
    steps: (n: number) => n === 1 ? '1 step' : `${n} steps`,
    active: 'Active',
    inactive: 'Inactive',
    editName: 'Name',
    editNamePlaceholder: 'e.g. 7-day follow-up',
    addStep: 'Add step',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    dayOffset: 'Day',
    channel: 'Channel',
    template: 'Template',
    note: 'Note',
    notePlaceholder: 'Optional note (max 200 chars)',
    deleteStep: 'Delete step',
    ownerOnly: 'Only the gym owner can edit sequences.',
    readOnly: 'Read-only view for coaches.',
  },
  es: {
    pageTitle: 'Secuencias',
    subtitle: 'Secuencias de seguimiento para miembros en riesgo',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    newSequence: 'Nueva secuencia',
    noSequences: 'No hay secuencias aún. Crea una para empezar.',
    steps: (n: number) => n === 1 ? '1 paso' : `${n} pasos`,
    active: 'Activa',
    inactive: 'Inactiva',
    editName: 'Nombre',
    editNamePlaceholder: 'ej. Seguimiento 7 días',
    addStep: 'Agregar paso',
    save: 'Guardar',
    saving: 'Guardando...',
    cancel: 'Cancelar',
    dayOffset: 'Día',
    channel: 'Canal',
    template: 'Plantilla',
    note: 'Nota',
    notePlaceholder: 'Nota opcional (máx 200 caracteres)',
    deleteStep: 'Eliminar paso',
    ownerOnly: 'Solo el dueño del gym puede editar secuencias.',
    readOnly: 'Vista de solo lectura para coaches.',
  },
} as const;

type StepChannel = 'whatsapp' | 'call' | 'in_person' | 'other';

interface StepDraft {
  position: number;
  day_offset: number;
  channel: StepChannel;
  template_key: string | null;
  note: string | null;
}

interface SequenceData {
  id: string;
  name: string;
  active: boolean;
  steps: Array<{
    id: string;
    sequence_id: string;
    position: number;
    day_offset: number;
    channel: string;
    template_key: string | null;
    note: string | null;
  }>;
}

export default function SequencesPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const channelLabels = STEP_CHANNEL_LABELS[language];

  const [sequences, setSequences] = useState<SequenceData[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editId, setEditId] = useState<string | null | 'new'>(null);
  const [editName, setEditName] = useState('');
  const [editSteps, setEditSteps] = useState<StepDraft[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tribe-os/sequences');
      const json = await res.json();
      if (json.success) {
        setSequences(json.data.sequences);
        setIsOwner(json.data.isOwner);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gate.state === 'allowed') {
      trackEvent('tribe_os_sequences_viewed');
      fetchSequences();
    }
  }, [gate.state, fetchSequences]);

  const startNew = () => {
    setEditId('new');
    setEditName('');
    setEditSteps([{ position: 1, day_offset: 0, channel: 'whatsapp', template_key: null, note: null }]);
  };

  const startEdit = (seq: SequenceData) => {
    setEditId(seq.id);
    setEditName(seq.name);
    setEditSteps(
      seq.steps.map((st) => ({
        position: st.position,
        day_offset: st.day_offset,
        channel: st.channel as StepChannel,
        template_key: st.template_key,
        note: st.note,
      }))
    );
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditSteps([]);
  };

  const addStep = () => {
    if (editSteps.length >= 20) return;
    const lastOffset = editSteps.length > 0 ? editSteps[editSteps.length - 1].day_offset : 0;
    setEditSteps([
      ...editSteps,
      {
        position: editSteps.length + 1,
        day_offset: Math.min(lastOffset + 3, 60),
        channel: 'whatsapp',
        template_key: null,
        note: null,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    const next = editSteps.filter((_, i) => i !== idx).map((st, i) => ({ ...st, position: i + 1 }));
    setEditSteps(next);
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= editSteps.length) return;
    const next = [...editSteps];
    [next[idx], next[target]] = [next[target], next[idx]];
    setEditSteps(next.map((st, i) => ({ ...st, position: i + 1 })));
  };

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setEditSteps(editSteps.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  };

  const handleSave = async () => {
    if (saving || !editName.trim() || editSteps.length === 0) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editName,
        steps: editSteps,
      };
      if (editId !== 'new') body.id = editId;

      const res = await fetch('/api/tribe-os/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        trackEvent(editId === 'new' ? 'tribe_os_sequence_created' : 'tribe_os_sequence_updated');
        cancelEdit();
        await fetchSequences();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (seq: SequenceData) => {
    if (!isOwner) return;
    const res = await fetch('/api/tribe-os/sequences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_type: 'toggle', id: seq.id, active: !seq.active }),
    });
    const json = await res.json();
    if (json.success) await fetchSequences();
  };

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}...
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
            <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
          </div>
          {isOwner && editId === null && (
            <Button onClick={startNew} size="sm" variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              {s.newSequence}
            </Button>
          )}
        </header>

        {!isOwner && !loading && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-tribe px-3 py-2">{s.readOnly}</p>
        )}

        {loading ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.loading}...</p>
        ) : editId !== null ? (
          <div className="bg-white rounded-tribe shadow-tribe p-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-tribe-dark">{s.editName}</span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value.slice(0, 120))}
                placeholder={s.editNamePlaceholder}
                className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-tribe focus:outline-none focus:ring-2 focus:ring-tribe-green/30"
              />
            </label>

            <div className="space-y-3">
              {editSteps.map((step, idx) => (
                <div key={idx} className="border border-gray-200 rounded-tribe p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-tribe-dark">#{step.position}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === editSteps.length - 1}
                        className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      {editSteps.length > 1 && (
                        <button type="button" onClick={() => removeStep(idx)}
                          className="p-1 rounded text-red-500 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="block text-[11px] font-medium text-tribe-dark-80">{s.dayOffset}</span>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={step.day_offset}
                        onChange={(e) => updateStep(idx, { day_offset: Math.min(60, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-tribe focus:outline-none focus:ring-1 focus:ring-tribe-green/30"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-tribe-dark-80">{s.channel}</span>
                      <select
                        value={step.channel}
                        onChange={(e) => updateStep(idx, { channel: e.target.value as StepChannel })}
                        className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-tribe focus:outline-none focus:ring-1 focus:ring-tribe-green/30"
                      >
                        {CHANNEL_OPTIONS.map((ch) => (
                          <option key={ch} value={ch}>{channelLabels[ch]}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-medium text-tribe-dark-80">{s.template}</span>
                      <select
                        value={step.template_key ?? ''}
                        onChange={(e) => updateStep(idx, { template_key: e.target.value || null })}
                        className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-tribe focus:outline-none focus:ring-1 focus:ring-tribe-green/30"
                      >
                        {TEMPLATE_OPTIONS.map((t) => (
                          <option key={t.value} value={t.value}>{t.label[language]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    <span className="block text-[11px] font-medium text-tribe-dark-80">{s.note}</span>
                    <input
                      type="text"
                      value={step.note ?? ''}
                      onChange={(e) => updateStep(idx, { note: e.target.value.slice(0, 200) || null })}
                      placeholder={s.notePlaceholder}
                      className="mt-0.5 w-full px-2 py-1.5 text-xs border border-gray-200 rounded-tribe focus:outline-none focus:ring-1 focus:ring-tribe-green/30"
                    />
                  </label>
                </div>
              ))}
            </div>

            {editSteps.length < 20 && (
              <button
                type="button"
                onClick={addStep}
                className="flex items-center gap-1 text-xs font-medium text-tribe-green-dark hover:underline"
              >
                <Plus className="h-3.5 w-3.5" />
                {s.addStep}
              </button>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} loading={saving} size="sm" variant="primary" disabled={!editName.trim() || editSteps.length === 0}>
                {saving ? s.saving : s.save}
              </Button>
              <button
                type="button"
                onClick={cancelEdit}
                className="text-sm font-medium text-tribe-dark-80 hover:underline"
              >
                {s.cancel}
              </button>
            </div>
          </div>
        ) : sequences.length === 0 ? (
          <p className="text-tribe-dark-80 text-sm py-12 text-center">{s.noSequences}</p>
        ) : (
          <div className="space-y-2">
            {sequences.map((seq) => (
              <div key={seq.id} className="bg-white rounded-tribe shadow-tribe">
                <div className="px-4 py-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id)}
                    className="shrink-0"
                  >
                    {expandedId === seq.id ? (
                      <ChevronDown className="h-4 w-4 text-tribe-dark-80" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-tribe-dark-80" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-tribe-dark truncate">{seq.name}</span>
                      <Badge variant={seq.active ? 'success' : 'default'}>
                        {seq.active ? s.active : s.inactive}
                      </Badge>
                      <span className="text-xs text-tribe-dark-80">{s.steps(seq.steps.length)}</span>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggle(seq)}
                        className="p-1.5 rounded-tribe hover:bg-gray-100 transition-colors"
                        title={seq.active ? s.inactive : s.active}
                      >
                        {seq.active ? (
                          <ToggleRight className="h-5 w-5 text-tribe-green-dark" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-tribe-dark-80" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(seq)}
                        className="p-1.5 rounded-tribe hover:bg-gray-100 transition-colors"
                      >
                        <Pencil className="h-4 w-4 text-tribe-dark-80" />
                      </button>
                    </div>
                  )}
                </div>
                {expandedId === seq.id && seq.steps.length > 0 && (
                  <div className="px-4 pb-3 border-t border-gray-100 pt-2">
                    <div className="space-y-1">
                      {seq.steps.map((st) => (
                        <div key={st.id} className="flex items-center gap-3 text-xs text-tribe-dark-80 py-1">
                          <span className="font-medium text-tribe-dark w-6">#{st.position}</span>
                          <span>{s.dayOffset} {st.day_offset}</span>
                          <span>{channelLabels[st.channel as keyof typeof channelLabels] ?? st.channel}</span>
                          {st.template_key && (
                            <span className="text-tribe-green-dark">
                              {TEMPLATE_OPTIONS.find((t) => t.value === st.template_key)?.label[language] ?? st.template_key}
                            </span>
                          )}
                          {st.note && <span className="truncate max-w-[200px]">{st.note}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
