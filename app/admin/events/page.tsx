/** Page: /admin/events — Manage local fitness events */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, CheckCircle, XCircle, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';
import { fetchLocalEvents, createLocalEvent, updateLocalEvent, deleteLocalEvent } from '@/lib/dal/localEvents';
import type { LocalFitnessEvent, LocalEventInsert } from '@/lib/dal/localEvents';
import { showSuccess, showError } from '@/lib/toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import ConfirmDialog from '@/components/ConfirmDialog';

const SPORT_OPTIONS = [
  'running',
  'cycling',
  'hiking',
  'yoga',
  'crossfit',
  'calisthenics',
  'swimming',
  'multi-sport',
  'skateboarding',
  'parkour',
] as const;

const EVENT_TYPES = ['recurring', 'one-time', 'series'] as const;
const RECURRENCE_PATTERNS = ['weekly', 'monthly', 'yearly'] as const;
const DIFFICULTY_OPTIONS = ['all', 'easy', 'moderate', 'hard'] as const;
const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const EMPTY_FORM: LocalEventInsert = {
  name: '',
  description_en: '',
  description_es: '',
  sport_type: 'running',
  event_type: 'recurring',
  recurrence_pattern: 'weekly',
  recurrence_day: 'saturday',
  location_name: '',
  address: '',
  start_time: '',
  end_time: '',
  organizer: '',
  website_url: '',
  is_free: true,
  price_info: '',
  difficulty: 'all',
};

export default function AdminEventsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [events, setEvents] = useState<LocalFitnessEvent[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LocalEventInsert>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    const result = await fetchLocalEvents(supabase);
    if (result.success && result.data) setEvents(result.data);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      if (!adminResult.success || !adminResult.data) {
        showError(t('Unauthorized', 'No autorizado'));
        router.push('/');
        return;
      }
      setAuthorized(true);
      await loadEvents();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleActive(event: LocalFitnessEvent) {
    setActionLoading(event.id);
    const result = await updateLocalEvent(supabase, event.id, { is_active: !event.is_active });
    if (result.success) {
      showSuccess(t('Status updated', 'Estado actualizado'));
      await loadEvents();
    } else {
      showError(result.error ?? t('Failed to update', 'Error al actualizar'));
    }
    setActionLoading(null);
  }

  async function handleDelete(eventId: string) {
    setActionLoading(eventId);
    const result = await deleteLocalEvent(supabase, eventId);
    if (result.success) {
      showSuccess(t('Event deleted', 'Evento eliminado'));
      await loadEvents();
    } else {
      showError(result.error ?? t('Failed to delete', 'Error al eliminar'));
    }
    setActionLoading(null);
    setConfirmDelete(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      showError(t('Name is required', 'El nombre es obligatorio'));
      return;
    }
    setSubmitting(true);
    const payload: LocalEventInsert = {
      ...form,
      recurrence_pattern: form.event_type === 'recurring' ? form.recurrence_pattern : null,
      recurrence_day: form.event_type === 'recurring' ? form.recurrence_day : null,
    };
    const result = await createLocalEvent(supabase, payload);
    if (result.success) {
      showSuccess(t('Event created', 'Evento creado'));
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      await loadEvents();
    } else {
      showError(result.error ?? t('Failed to create event', 'Error al crear evento'));
    }
    setSubmitting(false);
  }

  function updateForm(field: keyof LocalEventInsert, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#272D34]">
        <LoadingSpinner className="flex items-center justify-center min-h-screen" />
      </div>
    );
  }
  if (!authorized) return null;

  const inputClass =
    'w-full bg-[#52575D] text-white text-sm rounded-lg px-3 py-2 border border-[#52575D] focus:border-tribe-green outline-none placeholder-[#808890]';
  const labelClass = 'block text-xs text-[#B1B3B6] mb-1';

  return (
    <div className="min-h-screen bg-[#272D34] pb-16 safe-area-top">
      <div className="w-full max-w-2xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin" className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-white" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-tribe-green" />
              {t('Manage Events', 'Gestionar Eventos')}
            </h1>
            <p className="text-xs text-[#B1B3B6]">
              {t(`${events.length} total events`, `${events.length} eventos en total`)}
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-tribe-green text-slate-900 font-bold text-xs rounded-xl hover:bg-[#b0d853] transition"
          >
            <Plus className="w-4 h-4" />
            {t('Add Event', 'Agregar Evento')}
          </button>
        </div>

        {/* Inline add form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-[#3D4349] rounded-2xl p-4 border border-[#52575D] mb-5 space-y-3">
            <h2 className="text-white font-bold text-sm mb-2">{t('New Event', 'Nuevo Evento')}</h2>

            <div>
              <label className={labelClass}>{t('Name *', 'Nombre *')}</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder={t('Event name', 'Nombre del evento')}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Description (EN)', 'Descripcion (EN)')}</label>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={form.description_en ?? ''}
                  onChange={(e) => updateForm('description_en', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Description (ES)', 'Descripcion (ES)')}</label>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={form.description_es ?? ''}
                  onChange={(e) => updateForm('description_es', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Sport', 'Deporte')}</label>
                <select
                  className={inputClass}
                  value={form.sport_type}
                  onChange={(e) => updateForm('sport_type', e.target.value)}
                >
                  {SPORT_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('Event Type', 'Tipo de Evento')}</label>
                <select
                  className={inputClass}
                  value={form.event_type}
                  onChange={(e) => updateForm('event_type', e.target.value)}
                >
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {et}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.event_type === 'recurring' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t('Recurrence', 'Recurrencia')}</label>
                  <select
                    className={inputClass}
                    value={form.recurrence_pattern ?? 'weekly'}
                    onChange={(e) => updateForm('recurrence_pattern', e.target.value)}
                  >
                    {RECURRENCE_PATTERNS.map((rp) => (
                      <option key={rp} value={rp}>
                        {rp}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>{t('Day', 'Dia')}</label>
                  <select
                    className={inputClass}
                    value={form.recurrence_day ?? 'saturday'}
                    onChange={(e) => updateForm('recurrence_day', e.target.value)}
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Location Name', 'Nombre del Lugar')}</label>
                <input
                  className={inputClass}
                  value={form.location_name ?? ''}
                  onChange={(e) => updateForm('location_name', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Address', 'Direccion')}</label>
                <input
                  className={inputClass}
                  value={form.address ?? ''}
                  onChange={(e) => updateForm('address', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Start Time', 'Hora de Inicio')}</label>
                <input
                  className={inputClass}
                  type="time"
                  value={form.start_time ?? ''}
                  onChange={(e) => updateForm('start_time', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>{t('End Time', 'Hora de Fin')}</label>
                <input
                  className={inputClass}
                  type="time"
                  value={form.end_time ?? ''}
                  onChange={(e) => updateForm('end_time', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Organizer', 'Organizador')}</label>
                <input
                  className={inputClass}
                  value={form.organizer ?? ''}
                  onChange={(e) => updateForm('organizer', e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>{t('Website URL', 'URL del Sitio Web')}</label>
                <input
                  className={inputClass}
                  type="url"
                  value={form.website_url ?? ''}
                  onChange={(e) => updateForm('website_url', e.target.value)}
                  placeholder="https://"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>{t('Difficulty', 'Dificultad')}</label>
                <select
                  className={inputClass}
                  value={form.difficulty ?? 'all'}
                  onChange={(e) => updateForm('difficulty', e.target.value)}
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_free ?? true}
                    onChange={(e) => updateForm('is_free', e.target.checked)}
                    className="w-4 h-4 accent-[#C0E863] rounded"
                  />
                  <span className="text-sm text-white">{t('Free event', 'Evento gratuito')}</span>
                </label>
              </div>
            </div>

            {!form.is_free && (
              <div>
                <label className={labelClass}>{t('Price Info', 'Info de Precio')}</label>
                <input
                  className={inputClass}
                  value={form.price_info ?? ''}
                  onChange={(e) => updateForm('price_info', e.target.value)}
                  placeholder={t('e.g. 20,000 COP', 'ej. 20,000 COP')}
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 bg-tribe-green text-slate-900 font-bold text-sm rounded-xl hover:bg-[#b0d853] transition disabled:opacity-50"
              >
                {submitting ? '...' : t('Create Event', 'Crear Evento')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm({ ...EMPTY_FORM });
                }}
                className="px-4 py-2.5 bg-[#52575D] text-[#B1B3B6] font-bold text-sm rounded-xl hover:bg-[#62676D] transition"
              >
                {t('Cancel', 'Cancelar')}
              </button>
            </div>
          </form>
        )}

        {/* Event list */}
        {events.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-[#52575D] mx-auto mb-3" />
            <p className="text-[#B1B3B6] text-sm">{t('No events yet', 'Sin eventos aun')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                event={ev}
                actionLoading={actionLoading}
                onToggleActive={handleToggleActive}
                onDelete={(id) => setConfirmDelete(id)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title={t('Delete Event', 'Eliminar Evento')}
        message={t(
          'Are you sure you want to delete this event? This cannot be undone.',
          'Estas seguro de que quieres eliminar este evento? Esto no se puede deshacer.'
        )}
        confirmLabel={t('Delete', 'Eliminar')}
        cancelLabel={t('Cancel', 'Cancelar')}
        variant="danger"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function EventCard({
  event: ev,
  actionLoading,
  onToggleActive,
  onDelete,
  t,
}: {
  event: LocalFitnessEvent;
  actionLoading: string | null;
  onToggleActive: (ev: LocalFitnessEvent) => void;
  onDelete: (id: string) => void;
  t: (en: string, es: string) => string;
}) {
  const isLoading = actionLoading === ev.id;

  return (
    <div className="bg-[#3D4349] rounded-2xl p-4 border border-[#52575D]">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-white font-bold text-sm truncate">{ev.name}</h3>
          <p className="text-xs text-[#B1B3B6]">
            {ev.sport_type} &middot; {ev.event_type}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            ev.is_active
              ? 'bg-tribe-green/20 text-tribe-green border-tribe-green/30'
              : 'bg-red-500/20 text-red-300 border-red-500/30'
          }`}
        >
          {ev.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {ev.is_active ? t('ACTIVE', 'ACTIVO') : t('INACTIVE', 'INACTIVO')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-[#B1B3B6] mb-3">
        {ev.location_name && (
          <div>
            <span className="text-[#808890]">{t('Location', 'Lugar')}:</span> {ev.location_name}
          </div>
        )}
        {ev.organizer && (
          <div>
            <span className="text-[#808890]">{t('Organizer', 'Organizador')}:</span> {ev.organizer}
          </div>
        )}
        {ev.start_time && (
          <div>
            <span className="text-[#808890]">{t('Time', 'Hora')}:</span> {ev.start_time}
            {ev.end_time ? ` - ${ev.end_time}` : ''}
          </div>
        )}
        {ev.event_type === 'recurring' && ev.recurrence_day && (
          <div>
            <span className="text-[#808890]">{t('Schedule', 'Horario')}:</span> {ev.recurrence_pattern} /{' '}
            {ev.recurrence_day}
          </div>
        )}
        <div>
          <span className="text-[#808890]">{t('Difficulty', 'Dificultad')}:</span> {ev.difficulty}
        </div>
        <div>
          <span className="text-[#808890]">{t('Price', 'Precio')}:</span>{' '}
          {ev.is_free ? t('Free', 'Gratis') : (ev.price_info ?? '—')}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onToggleActive(ev)}
          disabled={isLoading}
          className={`flex-1 py-2 font-bold text-xs rounded-xl transition disabled:opacity-50 ${
            ev.is_active
              ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 hover:bg-orange-500/30'
              : 'bg-tribe-green/20 text-tribe-green border border-tribe-green/30 hover:bg-tribe-green/30'
          }`}
        >
          {isLoading ? '...' : ev.is_active ? t('Deactivate', 'Desactivar') : t('Activate', 'Activar')}
        </button>
        <button
          onClick={() => onDelete(ev.id)}
          disabled={isLoading}
          className="px-3 py-2 bg-red-500/20 text-red-300 border border-red-500/30 rounded-xl hover:bg-red-500/30 transition disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
