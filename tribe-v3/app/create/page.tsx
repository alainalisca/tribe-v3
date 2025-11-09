'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, Clock, MapPin, Users, FileText, Dumbbell } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { geocodeAddress } from '@/lib/location';

export default function CreateSessionPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});
  
  const [coordinates, setCoordinates] = useState<{latitude: number; longitude: number} | null>(null);
  const [formData, setFormData] = useState({
    sport: '',
    date: '',
    start_time: '',
    duration: 60,
    location: '',
    description: '',
    max_participants: 10,
    join_policy: 'open',
  });

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

  function validateForm() {
    const newErrors: any = {};
    const selectedDate = new Date(formData.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      newErrors.date = 'Date cannot be in the past';
    }

    if (formData.duration < 15) {
      newErrors.duration = 'Duration must be at least 15 minutes';
    }
    if (formData.duration > 480) {
      newErrors.duration = 'Duration cannot exceed 8 hours';
    }

    if (formData.max_participants < 2) {
      newErrors.max_participants = 'Must allow at least 2 participants';
    }
    if (formData.max_participants > 50) {
      newErrors.max_participants = 'Maximum 50 participants allowed';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!user) return;

    setLoading(true);

    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          creator_id: user.id,
          sport: formData.sport,
          date: formData.date,
          start_time: formData.start_time,
          duration: formData.duration,
          location: formData.location,
          description: formData.description || null,
          max_participants: formData.max_participants,
          join_policy: formData.join_policy,
          latitude: coordinates?.latitude || null,
          longitude: coordinates?.longitude || null,          current_participants: 1,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      alert(t('sessionCreated'));
      router.push(`/session/${session.id}`);
    } catch (error: any) {
      console.error('Error creating session:', error);
      alert('Error creating session: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const sports = [
    'Running', 'CrossFit', 'Basketball', 'Soccer', 'Tennis', 
    'Swimming', 'BJJ', 'Volleyball', 'Football', 'Cycling', 
    'Yoga', 'Climbing', 'Boxing', 'Dance',
  ];

  const today = new Date().toISOString().split('T')[0];

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      <div className="bg-theme-header p-4 sticky top-0 z-10 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href="/">
            <button className="p-2 hover:bg-slate-700 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-2xl font-bold text-theme-primary">{t('createSession')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <Dumbbell className="w-5 h-5 mr-2 text-tribe-green" />
              {t('sport')} *
            </label>
            <select
              required
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
            >
              <option value="">{t('selectSport')}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>{sport}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <Calendar className="w-5 h-5 mr-2 text-tribe-green" />
              {t('date')} *
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              min={today}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
            />
            {errors.date && <p className="text-red-400 text-sm mt-1">{errors.date}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center text-theme-primary font-medium mb-2">
                <Clock className="w-5 h-5 mr-2 text-tribe-green" />
                {t('startTime')} *
              </label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
              />
            </div>
            <div>
              <label className="flex items-center text-theme-primary font-medium mb-2">
                <Clock className="w-5 h-5 mr-2 text-tribe-green" />
                {t('duration')} *
              </label>
              <input
                type="number"
                required
                min="15"
                max="480"
                step="15"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
              />
              {errors.duration && <p className="text-red-400 text-sm mt-1">{errors.duration}</p>}
            </div>
          </div>

          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <MapPin className="w-5 h-5 mr-2 text-tribe-green" />
              {t('location')} *
            </label>
            <input
              type="text"
              required
              placeholder={t('locationPlaceholder')}
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              onBlur={async (e) => {
                if (e.target.value.length > 5) {
                  const coords = await geocodeAddress(e.target.value);
                  if (coords) setCoordinates(coords);
                }
              }}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:border-tribe-green"
            />
          </div>

          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <Users className="w-5 h-5 mr-2 text-tribe-green" />
              {t('maxParticipants')} *
            </label>
            <input
              type="number"
              required
              min="2"
              max="50"
              value={formData.max_participants}
              onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) })}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
            />
            {errors.max_participants && <p className="text-red-400 text-sm mt-1">{errors.max_participants}</p>}
          </div>

          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <Users className="w-5 h-5 mr-2 text-tribe-green" />
              Who can join?
            </label>
            <select
              value={formData.join_policy}
              onChange={(e) => setFormData({ ...formData, join_policy: e.target.value })}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary focus:outline-none focus:border-tribe-green"
            >
              <option value="open">Anyone can request to join</option>
              <option value="curated">Curated group (you select participants)</option>
              <option value="invite_only">Private - Invite only</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formData.join_policy === 'curated' && "You'll review each request and choose who joins"}
              {formData.join_policy === 'invite_only' && "Only people you directly invite can join"}
            </p>
          </div>

          <div>
            <label className="flex items-center text-theme-primary font-medium mb-2">
              <FileText className="w-5 h-5 mr-2 text-tribe-green" />
              {t('description')}
            </label>
            <textarea
              rows={4}
              placeholder={t('descriptionPlaceholder')}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-3 bg-theme-header border border-theme rounded-lg text-theme-primary placeholder-gray-500 focus:outline-none focus:border-tribe-green resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.description.length}/500 {t('charactersRemaining')}
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('creating') : t('createSession')}
          </button>
        </form>
      </div>
    </div>
  );
}
