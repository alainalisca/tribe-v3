'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { ArrowLeft, Upload, X, Image as ImageIcon } from 'lucide-react';
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

  // Compress image before upload
  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(blob as Blob);
          }, 'image/jpeg', 0.8);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 3) {
      showInfo(language === 'es' ? 'Máximo 3 fotos permitidas' : 'Maximum 3 photos allowed');
      return;
    }

    setUploadingPhotos(true);
    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Compress image
        const compressedBlob = await compressImage(file);
        
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${i}.${fileExt}`;

        const { data, error } = await supabase.storage
          .from('session-photos')
          .upload(fileName, compressedBlob, {
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
      showError((language === 'es' ? 'Error subiendo fotos: ' : 'Error uploading photos: ') + error.message);
    } finally {
      setUploadingPhotos(false);
    }
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  }

  function validate() {
    const newErrors: any = {};
    if (!formData.sport) newErrors.sport = language === 'es' ? 'El deporte es requerido' : 'Sport is required';
    if (!formData.date) newErrors.date = language === 'es' ? 'La fecha es requerida' : 'Date is required';
    if (!formData.start_time) newErrors.start_time = language === 'es' ? 'La hora es requerida' : 'Start time is required';
    if (!formData.location) newErrors.location = language === 'es' ? 'La ubicación es requerida' : 'Location is required';
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

      showSuccess(t('sessionCreated'));
      router.push('/');
    } catch (error: any) {
      showError('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        
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

          {/* Photo Upload Section - REDESIGNED */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">
              <ImageIcon className="w-4 h-4 inline mr-2" />
              {language === 'es' ? 'Fotos de ubicación (máx. 3)' : 'Location photos (max 3)'}
            </label>
            <p className="text-xs text-stone-500 mb-3">
              {language === 'es' 
                ? 'Ayuda a los participantes a encontrar el lugar de encuentro' 
                : 'Help participants find the meeting spot'}
            </p>
            
            <div className="flex gap-2 items-center">
              {/* Photo thumbnails */}
              {photos.map((photo, index) => (
                <div key={index} className="relative w-20 h-20 flex-shrink-0">
                  <img
                    src={photo}
                    alt={`Location ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg border-2 border-stone-200"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(index)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}

              {/* Upload button */}
              {photos.length < 3 && (
                <label className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-stone-300 rounded-lg cursor-pointer hover:border-tribe-green hover:bg-stone-50 transition flex items-center justify-center">
                  {uploadingPhotos ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tribe-green"></div>
                  ) : (
                    <Upload className="w-6 h-6 text-stone-400" />
                  )}
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
            </div>
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
