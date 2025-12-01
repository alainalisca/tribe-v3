'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Calendar, Clock, MapPin, Users, FileText, Dumbbell } from 'lucide-react';
import Link from 'next/link';

export default function EditSessionPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<any>({});
  
  const [formData, setFormData] = useState({
    sport: '',
    date: '',
    start_time: '',
    duration: 60,
    location: '',
    description: '',
    max_participants: 10,
  });

  useEffect(() => {
    checkUser();
  }, []);

  useEffect(() => {
    if (user && sessionId) {
      loadSession();
    }
  }, [user, sessionId]);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function loadSession() {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;

      if (data.creator_id !== user.id) {
        showError('You can only edit your own sessions');
        router.push(`/session/${sessionId}`);
        return;
      }

      setFormData({
        sport: data.sport,
        date: data.date,
        start_time: data.start_time,
        duration: data.duration,
        location: data.location,
        description: data.description || '',
        max_participants: data.max_participants,
      });
    } catch (error) {
      console.error('Error loading session:', error);
      showError('Error loading session');
    } finally {
      setLoading(false);
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

    setSaving(true);

    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          sport: formData.sport,
          date: formData.date,
          start_time: formData.start_time,
          duration: formData.duration,
          location: formData.location,
          description: formData.description || null,
          max_participants: formData.max_participants,
        })
        .eq('id', sessionId);

      if (error) throw error;

      showSuccess('Session updated successfully!');
      router.push(`/session/${sessionId}`);
    } catch (error: any) {
      console.error('Error updating session:', error);
      showError('Error updating session: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const sports = [
    'Running', 'CrossFit', 'Basketball', 'Soccer', 'Tennis', 
    'Swimming', 'BJJ', 'Volleyball', 'Football', 'Cycling', 
    'Yoga', 'Climbing', 'Boxing', 'Dance',
  ];

  const today = new Date().toISOString().split('T')[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-tribe-darker flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-tribe-darker pb-32">
      <div className="bg-tribe-dark p-4 sticky top-0 z-10 border-b border-slate-700">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href={`/session/${sessionId}`}>
            <button className="p-2 hover:bg-slate-700 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
          </Link>
          <h1 className="text-2xl font-bold text-white">Edit Session</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="flex items-center text-white font-medium mb-2">
              <Dumbbell className="w-5 h-5 mr-2 text-tribe-green" />
              Sport *
            </label>
            <select
              required
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
            >
              <option value="">Select a sport</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>{sport}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center text-white font-medium mb-2">
              <Calendar className="w-5 h-5 mr-2 text-tribe-green" />
              Date *
            </label>
            <input
              type="date"
              required
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              min={today}
              className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
            />
            {errors.date && <p className="text-red-400 text-sm mt-1">{errors.date}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center text-white font-medium mb-2">
                <Clock className="w-5 h-5 mr-2 text-tribe-green" />
                Start Time *
              </label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
              />
            </div>
            <div>
              <label className="flex items-center text-white font-medium mb-2">
                <Clock className="w-5 h-5 mr-2 text-tribe-green" />
                Duration (min) *
              </label>
              <input
                type="number"
                required
                min="15"
                max="480"
                step="15"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
                className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
              />
              {errors.duration && <p className="text-red-400 text-sm mt-1">{errors.duration}</p>}
            </div>
          </div>

          <div>
            <label className="flex items-center text-white font-medium mb-2">
              <MapPin className="w-5 h-5 mr-2 text-tribe-green" />
              Location *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Central Park, NYC"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-tribe-green"
            />
          </div>

          <div>
            <label className="flex items-center text-white font-medium mb-2">
              <Users className="w-5 h-5 mr-2 text-tribe-green" />
              Max Participants *
            </label>
            <input
              type="number"
              required
              min="2"
              max="50"
              value={formData.max_participants}
              onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) })}
              className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white focus:outline-none focus:border-tribe-green"
            />
            {errors.max_participants && <p className="text-red-400 text-sm mt-1">{errors.max_participants}</p>}
          </div>

          <div>
            <label className="flex items-center text-white font-medium mb-2">
              <FileText className="w-5 h-5 mr-2 text-tribe-green" />
              Description
            </label>
            <textarea
              rows={4}
              placeholder="Add any additional details about the session..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-3 bg-tribe-dark border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-tribe-green resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">{formData.description.length}/500 characters</p>
          </div>

          <div className="flex gap-3">
            <Link href={`/session/${sessionId}`} className="flex-1">
              <button
                type="button"
                className="w-full py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition"
              >
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
