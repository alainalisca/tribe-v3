'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { ArrowLeft, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';

export default function CreateSessionPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  
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

  const sports = Object.keys(sportTranslations);

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

  function handleChange(e: any) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev: any) => ({ ...prev, [name]: '' }));
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 3) {
      alert('Maximum 3 photos allowed');
      return;
    }

    setUploadingPhotos(true);
    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${i}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('session-photos')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('session-photos')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      setPhotos(prev => [...prev, ...uploadedUrls]);
    } catch (error: any) {
      alert('Error uploading photos: ' + error.message);
    } finally {
      setUploadingPhotos(false);
    }
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }

  function validate() {
    const newErrors: any = {};
    if (!formData.sport) newErrors.sport = 'Sport is required';
    if (!formData.date) newErrors.date = 'Date is required';
    if (!formData.start_time) newErrors.start_time = 'Start time is required';
    if (!formData.location) newErrors.location = 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          ...formData,
          creator_id: user.id,
          current_participants: 0,
          status: 'active',
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          photos: photos.length > 0 ? photos : null,
        })
        .select()
        .single();

      if (error) throw error;

      alert(t('sessionCreated'));
      router.push('/');
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href="/">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{t('createSession')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {t('sport')} *
            </label>
            <select
              name="sport"
              value={formData.sport}
              onChange={handleChange}
              className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${
                errors.sport ? 'border-red-500' : 'border-theme'
              }`}
            >
              <option value="">{t('selectSport')}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {language === 'es' ? (sportTranslations[sport]?.es || sport) : sport}
                </option>
              ))}
            </select>
            {errors.sport && <p className="text-red-500 text-sm mt-1">{errors.sport}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                {t('date')} *
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                min={new Date().toISOString().split('T')[0]}
                className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${
                  errors.date ? 'border-red-500' : 'border-theme'
                }`}
              />
              {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                {t('startTime')} *
              </label>
              <input
                type="time"
                name="start_time"
                value={formData.start_time}
                onChange={handleChange}
                className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${
                  errors.start_time ? 'border-red-500' : 'border-theme'
                }`}
              />
              {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {t('location')} *
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder={language === 'es' ? 'ej. Parque Lleras' : 'e.g. Central Park'}
              className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${
                errors.location ? 'border-red-500' : 'border-theme'
              }`}
            />
            {errors.location && <p className="text-red-500 text-sm mt-1">{errors.location}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {t('duration')} ({language === 'es' ? 'minutos' : 'minutes'})
            </label>
            <input
              type="number"
              name="duration"
              value={formData.duration}
              onChange={handleChange}
              min="15"
              step="15"
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {t('maxParticipants')}
            </label>
            <input
              type="number"
              name="max_participants"
              value={formData.max_participants}
              onChange={handleChange}
              min="2"
              max="50"
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {language === 'es' ? 'Política de unión' : 'Join Policy'}
            </label>
            <select
              name="join_policy"
              value={formData.join_policy}
              onChange={handleChange}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            >
              <option value="open">{language === 'es' ? 'Abierto - Cualquiera puede unirse' : 'Open - Anyone can join'}</option>
              <option value="curated">{language === 'es' ? 'Curado - Revisas solicitudes' : 'Curated - You review requests'}</option>
              <option value="invite_only">{language === 'es' ? 'Solo invitación - Privado' : 'Invite Only - Private'}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {t('description')}
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={4}
              placeholder={language === 'es' ? 'Describe tu sesión...' : 'Describe your session...'}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary resize-none"
            />
          </div>

          {/* Photo Upload Section */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              {language === 'es' ? 'Fotos (máximo 3)' : 'Photos (max 3)'}
            </label>
            
            {photos.length < 3 && (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-theme rounded-lg cursor-pointer hover:bg-stone-50 transition">
                <Upload className="w-8 h-8 text-stone-400 mb-2" />
                <span className="text-sm text-stone-500">
                  {uploadingPhotos ? (language === 'es' ? 'Subiendo...' : 'Uploading...') : 
                   (language === 'es' ? 'Click para subir fotos' : 'Click to upload photos')}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhotos}
                  className="hidden"
                />
              </label>
            )}

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {photos.map((photo, index) => (
                  <div key={index} className="relative aspect-square">
                    <img
                      src={photo}
                      alt={`Session photo ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || uploadingPhotos}
            className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
          >
            {loading ? (language === 'es' ? 'Creando...' : 'Creating...') : t('createSession')}
          </button>
        </form>
      </div>

      <BottomNav />
    </div>
  );
}
