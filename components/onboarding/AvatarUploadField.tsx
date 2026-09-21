'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { uploadAvatar } from '@/lib/avatarUpload';
import { updateUser } from '@/lib/dal';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';

/**
 * A photo field that is genuinely optional.
 *
 * Compression and upload come from lib/avatarUpload.ts, shared with
 * /profile/edit, so the 600px/0.85 constants exist in one place.
 *
 * IT SAVES IMMEDIATELY rather than holding the URL for a later submit. The
 * step it sits in can be completed without ever touching this field, so there
 * is no guaranteed later write to attach it to -- holding it would mean a
 * photo that silently vanishes for anyone who skips.
 *
 * ES copy is provisional and goes to Ana.
 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export default function AvatarUploadField({ language }: { language: string }) {
  const supabase = createClient();
  const isEs = language === 'es';
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      showError(isEs ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('not signed in');

      const { publicUrl } = await uploadAvatar(supabase, user.id, file);

      // Persisted now, not deferred. A skippable field has no later submit.
      const saved = await updateUser(supabase, user.id, { avatar_url: publicUrl });
      if (!saved.success) throw new Error(saved.error);

      setUrl(publicUrl);
    } catch (error) {
      logError(error, { action: 'AvatarUploadField.upload' });
      showError(isEs ? 'No se pudo subir la foto' : 'Could not upload the photo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-stone-300 bg-theme-surface disabled:opacity-50 dark:border-tribe-mid"
        aria-label={isEs ? 'Subir foto' : 'Upload photo'}
      >
        {url ? (
          <Image src={url} alt="" fill className="object-cover" sizes="80px" />
        ) : (
          <Camera className="mx-auto h-6 w-6 text-theme-tertiary" aria-hidden />
        )}
      </button>

      <div className="min-w-0">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-sm font-semibold text-theme-primary underline disabled:opacity-50"
        >
          {busy
            ? isEs
              ? 'Subiendo…'
              : 'Uploading…'
            : url
              ? isEs
                ? 'Cambiar foto'
                : 'Change photo'
              : isEs
                ? 'Subir una foto'
                : 'Upload a photo'}
        </button>
        {url && <p className="mt-1 text-xs text-theme-tertiary">{isEs ? 'Guardada.' : 'Saved.'}</p>}
      </div>

      <input ref={inputRef} type="file" accept={ALLOWED.join(',')} onChange={onPick} className="hidden" />
    </div>
  );
}
