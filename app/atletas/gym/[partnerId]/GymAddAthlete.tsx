'use client';

import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { createClient } from '@/lib/supabase/client';
import { normalizeWhatsApp } from '@/lib/pase/phone';
import { SEARCH_MIN_CHARS, searchAthleteCandidates, type AthleteCandidate } from '@/lib/dal/athleteGym';
import { addProgramAthlete } from '@/lib/dal/athleteGymWrites';
import { useGymWrite } from './useGymWrite';

/**
 * T-AV26 "Agregar atleta" (owner and admin only).
 *
 * SEARCH IS ON SUBMIT, NOT AS YOU TYPE. av_athletes_search_candidates (8208)
 * allows 30 searches an hour; searching per keystroke would spend that on one
 * name. Nothing is asked below SEARCH_MIN_CHARS. A result is a name and a
 * photo, nothing else (Al's decision 3), and an email query only ever matches
 * one full address.
 *
 * WHATSAPP is optional and normalized with lib/pase/phone.ts BEFORE
 * av_athletes_add, which takes E.164 only. A number that cannot be normalized
 * shows gym.addWhatsappInvalid and sends nothing.
 */
interface GymAddAthleteProps {
  partnerId: string;
  maxAthletes: number;
}

export default function GymAddAthlete({ partnerId, maxAthletes }: GymAddAthleteProps) {
  const t = useTranslations('gym');
  const td = useTranslations('door');
  const { busy, error, run } = useGymWrite();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AthleteCandidate[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AthleteCandidate | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappInvalid, setWhatsappInvalid] = useState(false);

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS || searching) return;
    setSearching(true);
    setSearchFailed(false);
    setSelected(null);
    const result = await searchAthleteCandidates(createClient(), partnerId, q);
    setSearching(false);
    if (!result.success) {
      setResults([]);
      setSearchFailed(result.error !== 'too_short');
      return;
    }
    setResults(result.data ?? []);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const raw = whatsapp.trim();
    const e164 = raw === '' ? null : normalizeWhatsApp(raw);
    if (raw !== '' && e164 === null) {
      setWhatsappInvalid(true);
      return;
    }
    setWhatsappInvalid(false);
    const ok = await run('add', () => addProgramAthlete(createClient(), partnerId, selected.id, e164));
    if (ok) {
      setSelected(null);
      setResults([]);
      setQuery('');
      setWhatsapp('');
    }
  }

  const addError = (code: string): string => {
    if (code === 'program_full') return t('addCap', { max: maxAthletes });
    if (code === 'already_added') return t('addAlready');
    if (code === 'invalid_whatsapp') return t('addWhatsappInvalid');
    return td('error');
  };

  const input =
    'w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-base text-tribe-dark placeholder:text-stone-500';

  return (
    <section className="rounded-2xl bg-theme-card p-4" data-add-athlete>
      <h2 className="text-base font-bold text-theme-primary">{t('addTitle')}</h2>

      <form onSubmit={search} className="mt-3 flex gap-2" role="search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('addSearch')}
          aria-label={t('addSearch')}
          maxLength={254}
          autoComplete="off"
          className={input}
          data-add-query
        />
        <button
          type="submit"
          aria-label={t('addSearch')}
          disabled={searching || query.trim().length < SEARCH_MIN_CHARS}
          className="flex min-w-[48px] items-center justify-center rounded-xl bg-tribe-dark text-white disabled:opacity-50"
          data-add-search
        >
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>
      {searchFailed ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {td('error')}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 space-y-2" data-add-results>
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-pressed={selected?.id === r.id}
                onClick={() => setSelected(r)}
                data-candidate={r.id}
                className={
                  selected?.id === r.id
                    ? 'flex w-full items-center gap-3 rounded-xl bg-tribe-green px-3 py-2 text-left'
                    : 'flex w-full items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 py-2 text-left'
                }
              >
                {r.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a user photo of unknown host, as on /atletas/
                  <img src={r.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover object-top" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-sm font-bold text-tribe-dark">
                    {r.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm font-semibold text-tribe-dark">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected ? (
        <form onSubmit={add} className="mt-3 space-y-2" data-add-form>
          <label className="block text-sm font-semibold text-theme-primary" htmlFor="gym-add-whatsapp">
            {t('addWhatsapp')}
          </label>
          <input
            id="gym-add-whatsapp"
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+57 300 123 4567"
            autoComplete="off"
            className={input}
            data-add-whatsapp
          />
          {whatsappInvalid ? (
            <p role="alert" className="text-sm text-red-700" data-whatsapp-invalid>
              {t('addWhatsappInvalid')}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy !== null}
            data-add-submit
            className="w-full rounded-xl bg-tribe-green px-4 py-3 text-base font-bold text-tribe-dark disabled:opacity-50"
          >
            {t('addTitle')}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700" data-add-error={error.code}>
          {addError(error.code)}
        </p>
      ) : null}
    </section>
  );
}
