'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { fetchDoorPass } from '@/lib/dal/passDoor';

/**
 * T-AV25 (D13): type a pass code at the door. A code that resolves for this
 * coach opens the verify page with ?via=code, so the show-up is stored as
 * method `code`. Anything else shows ONE message inline (decision 2):
 *
 *   - not the pass shape (XX-XXXX): no request at all;
 *   - no such pass, or another gym's pass: av_door_pass answers both with the
 *     same not_found (T-AV21 test 3), so they are the same here too.
 *
 * Different messages for "unknown" and "not yours" would let anyone at a door
 * enumerate which codes exist (recon 5.2, door.codeNotFound).
 */
export const PASS_CODE_SHAPE = /^[A-Z]{2}-[A-Z2-9]{4}$/;

export default function DoorCodeEntry() {
  const t = useTranslations('door');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setMessage(null);
    const normalized = code.trim().toUpperCase();
    if (!PASS_CODE_SHAPE.test(normalized)) {
      setMessage(t('codeNotFound'));
      return;
    }
    setBusy(true);
    const result = await fetchDoorPass(createClient(), normalized);
    if (!result.success) {
      setBusy(false);
      setMessage(t('error'));
      return;
    }
    if (!result.data) {
      setBusy(false);
      setMessage(t('codeNotFound'));
      return;
    }
    router.push(`/pase/verificar/${encodeURIComponent(normalized)}/?via=code`);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white p-4" data-code-entry>
      <label htmlFor="door-code" className="text-sm font-semibold text-tribe-dark">
        {t('codeLabel')}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="door-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="go"
          placeholder="BU-4F7K"
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-3 text-base uppercase tracking-widest text-tribe-dark"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={t('codeLabel')}
          className="flex w-14 flex-shrink-0 items-center justify-center rounded-lg bg-tribe-dark text-white disabled:opacity-50"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
      {message ? (
        <p role="alert" data-code-message className="mt-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </form>
  );
}
