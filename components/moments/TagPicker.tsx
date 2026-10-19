'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, Check, Minus, Search, UserPlus, X } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { checkInvite } from '@/lib/moments/inviteCheck';
import { personKey, type MomentItem, type TaggablePerson, type TagTarget } from '@/lib/moments/types';

/**
 * T-MOM1: the tagging picker. Opens on the selected photos; each person shows
 * whether they are on all of them (checked), some (a dash) or none. "Listo"
 * tags whoever is now checked on every selected photo and untags whoever was
 * unchecked. "Alguien que no está en Tribe" opens the invite form (name,
 * optional WhatsApp) inside the same sheet and checks the new person.
 */
type Mark = 'all' | 'some' | 'none';

export function initialMarks(people: TaggablePerson[], selected: MomentItem[]): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  for (const p of people) {
    const key = personKey(p);
    const on = selected.filter((m) => m.tags.some((t) => !t.removed && `${t.kind}:${t.personId}` === key)).length;
    marks.set(key, on === 0 ? 'none' : on === selected.length ? 'all' : 'some');
  }
  return marks;
}

/** What "Listo" sends: who to add to every selected photo, who to remove from them. */
export function diffMarks(
  people: TaggablePerson[],
  before: Map<string, Mark>,
  after: Map<string, Mark>
): { add: TagTarget[]; remove: TagTarget[] } {
  const add: TagTarget[] = [];
  const remove: TagTarget[] = [];
  for (const p of people) {
    const key = personKey(p);
    const was = before.get(key) ?? 'none';
    const now = after.get(key) ?? 'none';
    if (now === was) continue;
    const target: TagTarget = { kind: p.kind === 'host' ? 'user' : p.kind, id: p.id };
    if (now === 'all') add.push(target);
    else if (now === 'none' && target.kind !== 'guest') remove.push(target);
  }
  return { add, remove };
}

export default function TagPicker({
  open,
  onClose,
  people,
  selected,
  onApply,
  onCreateInvite,
  startWithInvite = false,
}: {
  open: boolean;
  onClose: () => void;
  people: TaggablePerson[];
  selected: MomentItem[];
  onApply: (add: TagTarget[], remove: TagTarget[]) => Promise<void>;
  onCreateInvite: (name: string, phone: string | null) => Promise<TaggablePerson>;
  startWithInvite?: boolean;
}) {
  const t = useTranslations('moments');
  const before = useMemo(() => initialMarks(people, selected), [people, selected]);
  const [marks, setMarks] = useState(before);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'invite'>(startWithInvite ? 'invite' : 'list');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = people.filter((p) => !q || p.name.toLowerCase().includes(q));
  const sections: Array<[string, TaggablePerson[]]> = [
    [t('host'), visible.filter((p) => p.kind === 'host')],
    [t('inSession'), visible.filter((p) => p.kind === 'user')],
    [t('invited'), visible.filter((p) => p.kind === 'guest' || p.kind === 'invite')],
  ];

  const toggle = (p: TaggablePerson) =>
    setMarks((m) => new Map(m).set(personKey(p), (m.get(personKey(p)) ?? 'none') === 'all' ? 'none' : 'all'));

  async function addInvite() {
    const check = checkInvite({ name, phone });
    if (!check.ok) {
      setError(check.error === 'invalid_phone' ? t('invalidPhone') : t('nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const person = await onCreateInvite(check.name, check.phone);
      setMarks((m) => new Map(m).set(personKey(person), 'all'));
      setName('');
      setPhone('');
      setError(null);
      setView('list');
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setSaving(false);
    }
  }

  async function done() {
    const { add, remove } = diffMarks(people, before, marks);
    setSaving(true);
    try {
      if (add.length || remove.length) await onApply(add, remove);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const row =
    'w-full flex items-center gap-3 px-1 py-2.5 text-left text-[15px] text-stone-900 dark:text-white border-b border-stone-100 dark:border-tribe-mid';

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(39,45,52,0.45)]" />
        <DialogPrimitive.Content
          data-testid="tag-picker"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] max-w-2xl flex-col rounded-t-[22px] bg-white dark:bg-tribe-card shadow-[0_-10px_30px_rgba(0,0,0,0.18)]"
          style={{ paddingBottom: 'var(--safe-area-inset-bottom, 0px)' }}
        >
          <div className="px-4 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-stone-200 dark:bg-tribe-mid" aria-hidden="true" />
            <div className="flex items-center justify-between gap-2">
              {view === 'invite' ? (
                <button type="button" onClick={() => setView('list')} aria-label={t('back')} className="p-1 -ml-1">
                  <ArrowLeft className="h-5 w-5" />
                </button>
              ) : null}
              <DialogPrimitive.Title className="flex-1 text-lg font-extrabold text-stone-900 dark:text-white">
                {view === 'invite' ? t('inviteTitle') : t('pickerTitle')}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close aria-label={t('back')} className="rounded-full p-2 text-stone-500">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
            <DialogPrimitive.Description className="text-sm text-stone-500">
              {t('pickerSubtitle', { count: selected.length })}
            </DialogPrimitive.Description>
          </div>

          {view === 'list' ? (
            <>
              <div className="px-4 pt-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('search')}
                    aria-label={t('search')}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm dark:border-tribe-mid dark:bg-tribe-mid"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-2">
                {sections.map(([title, list]) =>
                  list.length ? (
                    <div key={title} className="mt-3">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{title}</p>
                      {list.map((p) => {
                        const mark = marks.get(personKey(p)) ?? 'none';
                        return (
                          <button
                            key={personKey(p)}
                            type="button"
                            role="checkbox"
                            aria-checked={mark === 'all' ? true : mark === 'some' ? 'mixed' : false}
                            onClick={() => toggle(p)}
                            className={row}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-sm font-bold text-stone-700 dark:bg-tribe-mid dark:text-white">
                              {'avatarUrl' in p && p.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                p.name.slice(0, 1).toUpperCase()
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{p.name}</span>
                              {(p.kind === 'guest' || p.kind === 'invite') && !p.hasPhone && (
                                <span className="block text-xs text-stone-500">{t('noPhone')}</span>
                              )}
                            </span>
                            <span
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                                mark === 'none' ? 'border-stone-300' : 'border-[#A8DA36] bg-[#A8DA36] text-stone-900'
                              }`}
                            >
                              {mark === 'all' ? (
                                <Check className="h-4 w-4" />
                              ) : mark === 'some' ? (
                                <Minus className="h-4 w-4" />
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null
                )}
                <button type="button" onClick={() => setView('invite')} className={`${row} mt-2 font-semibold`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E9F7C7] text-[#4D7300]">
                    <UserPlus className="h-5 w-5" />
                  </span>
                  {t('notOnTribe')}
                </button>
              </div>
              <div className="border-t border-stone-200 px-4 py-3 dark:border-tribe-mid">
                <button
                  type="button"
                  disabled={saving}
                  onClick={done}
                  className="w-full rounded-xl bg-[#A8DA36] py-3 text-[15px] font-extrabold text-stone-900 disabled:opacity-60"
                >
                  {t('done')}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3 px-4 pb-4 pt-3" data-testid="invite-form">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-stone-600">{t('inviteName')}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border-[1.5px] border-stone-300 px-3 py-2.5 text-[15px] focus:border-stone-900"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.04em] text-stone-600">
                  {t('inviteWhatsApp')}
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="300 123 4567"
                  className="mt-1 w-full rounded-xl border-[1.5px] border-stone-300 px-3 py-2.5 text-[15px] focus:border-stone-900"
                />
                <span className="mt-1 block text-xs text-stone-500">{t('inviteWhatsAppHint')}</span>
              </label>
              {error && (
                <p role="alert" className="text-sm font-semibold text-red-600">
                  {error}
                </p>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={addInvite}
                className="w-full rounded-xl bg-[#A8DA36] py-3 text-[15px] font-extrabold text-stone-900 disabled:opacity-60"
              >
                {t('inviteAdd')}
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
