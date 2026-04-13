'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { useLanguage } from '@/lib/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { updateSession } from '@/lib/dal';
import type { Session } from '@/lib/database.types';

interface EditSessionModalProps {
  session: Session;
  onClose: () => void;
  onSave: () => void;
}

export default function EditSessionModal({ session, onClose, onSave }: EditSessionModalProps) {
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sport: session.sport,
    date: session.date,
    start_time: session.start_time,
    duration: session.duration,
    location: session.location,
    max_participants: session.max_participants,
    description: session.description || '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await updateSession(supabase, session.id, formData);
      if (!result.success) throw new Error(result.error);

      showSuccess(language === 'es' ? 'Sesión actualizada exitosamente' : 'Session updated successfully!');
      onSave();
      onClose();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_session', language));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-modal="true"
        className="max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-6 dark:bg-tribe-card"
      >
        <DialogTitle className="text-2xl font-bold text-stone-900 dark:text-white">{t('editSession')}</DialogTitle>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('sport')}</Label>
            <Input
              type="text"
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="px-4 py-3 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white focus:ring-tribe-green"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('date')}</Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="px-4 py-3 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white focus:ring-tribe-green"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('startTime')}</Label>
            <Input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              className="px-4 py-2 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('durationMinutes')}</Label>
            <Input
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
              className="px-4 py-2 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('location')}</Label>
            <Input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="px-4 py-2 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('maxParticipants')}</Label>
            <Input
              type="number"
              value={formData.max_participants}
              onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) })}
              className="px-4 py-2 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white"
              required
            />
          </div>

          <div>
            <Label className="text-stone-700 dark:text-gray-300 mb-2">{t('description')}</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-4 py-2 bg-white dark:bg-tribe-mid dark:border-[#52575D] text-stone-900 dark:text-white"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 py-3 border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white font-semibold rounded-lg hover:bg-stone-100 dark:hover:bg-tribe-mid"
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 py-3 font-semibold rounded-lg">
              {loading ? t('saving') : t('saveChanges')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
