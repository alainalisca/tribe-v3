'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ImagePlus, Loader2, MessageCircle, Trash2 } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import TagPicker from '@/components/moments/TagPicker';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { prepareImage } from '@/lib/moments/prepareImage';
import type { MomentsApi } from '@/lib/moments/api';
import type { MomentItem, SessionMomentsState, TaggablePerson, TagTarget } from '@/lib/moments/types';

/**
 * T-MOM1 Part B: /session/<id>/fotos/subir/. One screen: add photos (JPG or
 * HEIC, resized and stripped in the browser, 3 at a time, each retried once),
 * see the batch, select several and "Etiquetar a" once, then "Entregar".
 * Untagged photos wait under "Sin etiquetar", visible only to the uploader and
 * the host. Nothing reaches the tagged people before "Entregar".
 *
 * Part C: after "Entregar", each invite with a WhatsApp number gets "Enviar
 * por WhatsApp", which opens WhatsApp with the message and their claim link
 * (/m/<token>/). The uploader sends it from their own phone.
 */
type SendItem = { id: string; name: string; count: number; href: string };
type QueueItem = { key: string; name: string; progress: number; status: 'working' | 'failed' };

const CONCURRENCY = 3;

export default function MomentsUploader({
  sessionId,
  sessionTitle,
  initial,
  api,
  openPicker = null,
}: {
  sessionId: string;
  sessionTitle: string;
  initial: SessionMomentsState;
  api: MomentsApi;
  /** /dev/moments only: open the picker (or its invite form) on the first selection, for review. */
  openPicker?: 'list' | 'invite' | null;
}) {
  const t = useTranslations('moments');
  const [items, setItems] = useState<MomentItem[]>(initial.media);
  const [people, setPeople] = useState<TaggablePerson[]>(initial.people);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() =>
    openPicker ? new Set(initial.media.slice(0, 3).map((m) => m.id)) : new Set()
  );
  const [pickerOpen, setPickerOpen] = useState(!!openPicker);
  const [pickerKey, setPickerKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [toSend, setToSend] = useState<SendItem[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const untagged = items.filter((m) => !m.tags.some((x) => !x.removed));
  const tagged = items.filter((m) => m.tags.some((x) => !x.removed));
  const pending = useMemo(() => {
    const keys = new Set<string>();
    for (const m of items) for (const x of m.tags) if (!x.delivered && !x.removed) keys.add(`${x.kind}:${x.personId}`);
    return keys.size;
  }, [items]);
  const selectedItems = items.filter((m) => selected.has(m.id));

  function setQ(key: string, patch: Partial<QueueItem> | null) {
    setQueue((q) =>
      patch === null ? q.filter((x) => x.key !== key) : q.map((x) => (x.key === key ? { ...x, ...patch } : x))
    );
  }

  async function uploadOne(file: File, key: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { blob, takenAt } = await prepareImage(file);
        const item = await api.upload(blob, takenAt, (p) => setQ(key, { progress: p }));
        setItems((list) => [...list, item]);
        setQ(key, null);
        return;
      } catch {
        if (attempt === 1) setQ(key, { status: 'failed', progress: 0 });
      }
    }
  }

  async function addFiles(files: FileList | File[]) {
    const list = [...files].filter((f) => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png)$/i.test(f.name));
    if (!list.length) return;
    const entries = list.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
    setQueue((q) => [
      ...q,
      ...entries.map((e) => ({ key: e.key, name: e.file.name, progress: 0, status: 'working' as const })),
    ]);
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const e = entries[next++];
        await uploadOne(e.file, e.key);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function applyTags(add: TagTarget[], remove: TagTarget[]) {
    const ids = [...selected];
    let state: SessionMomentsState | null = null;
    if (add.length) state = await api.tag(ids, add, 'add');
    if (remove.length) state = await api.tag(ids, remove, 'remove');
    if (state) {
      setItems(state.media);
      setPeople(state.people);
    }
    setSelected(new Set());
  }

  async function createInvite(name: string, phone: string | null) {
    const person = await api.createInvite(name, phone);
    setPeople((p) => [...p, person]);
    return person;
  }

  async function deliver() {
    setDelivering(true);
    try {
      const r = await api.deliver();
      setItems((list) =>
        list.map((m) => ({ ...m, tags: m.tags.map((x) => (x.removed ? x : { ...x, delivered: true })) }))
      );
      setNotice(t('delivered', { photos: r.photos, people: r.people }));
      const send: SendItem[] = [];
      for (const i of r.invites) if (i.whatsappUrl) send.push({ id: i.id, name: i.name, count: i.count, href: i.whatsappUrl });
      setToSend(send);
    } catch {
      setNotice(t('deliverFailed'));
    } finally {
      setDelivering(false);
    }
  }

  async function deleteSelected() {
    const ids = [...selected];
    setConfirmDelete(false);
    for (const id of ids) {
      try {
        await api.remove(id);
        setItems((list) => list.filter((m) => m.id !== id));
      } catch {
        setNotice(t('errorGeneric'));
      }
    }
    setSelected(new Set());
  }

  const working = queue.filter((q) => q.status === 'working').length;
  const failed = queue.filter((q) => q.status === 'failed');

  const tile = (m: MomentItem) => {
    const on = selected.has(m.id);
    const live = m.tags.filter((x) => !x.removed);
    const waiting = live.some((x) => !x.delivered);
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => toggle(m.id)}
        aria-pressed={on}
        aria-label={live.length ? live.map((x) => x.name).join(', ') : t('untagged')}
        className={`relative aspect-square overflow-hidden rounded-lg bg-stone-200 ${on ? 'ring-[3px] ring-[#A8DA36] ring-offset-1' : ''}`}
      >
        {m.gridUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.gridUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        {on && (
          <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#A8DA36] text-stone-900">
            <Check className="h-4 w-4" />
          </span>
        )}
        {live.length > 0 && (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
            {waiting && <span className="h-1.5 w-1.5 rounded-full bg-[#A8DA36]" aria-label={t('pendingDelivery')} />}
            {live.length === 1 ? live[0].name.split(' ')[0] : t('people', { count: live.length })}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-[#F7F8F6] pb-40 dark:bg-tribe-mid">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-[#F7F8F6]/95 backdrop-blur dark:border-tribe-mid dark:bg-tribe-dark/95">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
          <Link href={`/session/${sessionId}/`} aria-label={t('back')} className="-ml-2 p-2">
            <ArrowLeft className="h-5 w-5 text-stone-900 dark:text-white" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold leading-tight text-stone-900 dark:text-white">{t('title')}</h1>
            <p className="truncate text-xs text-stone-500">{sessionTitle}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(e.dataTransfer.files);
          }}
          className={`rounded-2xl border-2 border-dashed p-5 text-center ${
            dragging
              ? 'border-[#A8DA36] bg-[#F6FBE8]'
              : 'border-stone-300 bg-white dark:border-tribe-mid dark:bg-tribe-card'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = '';
            }}
            data-testid="moments-file-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mx-auto inline-flex items-center gap-2 rounded-xl bg-[#A8DA36] px-5 py-3 text-[15px] font-extrabold text-stone-900"
          >
            <ImagePlus className="h-5 w-5" />
            {t('add')}
          </button>
          <p className="mt-2 text-xs text-stone-500">{t('dropHint')}</p>
          {working > 0 && (
            <p
              className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-stone-700"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('uploading', { done: items.length, total: items.length + working })}
            </p>
          )}
          {queue.some((q) => q.status === 'working') && (
            <div className="mt-2 space-y-1.5 text-left">
              {queue
                .filter((q) => q.status === 'working')
                .slice(0, 4)
                .map((q) => (
                  <div key={q.key} className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full bg-[#A8DA36] transition-[width]"
                      style={{ width: `${Math.round(q.progress * 100)}%` }}
                    />
                  </div>
                ))}
            </div>
          )}
          {failed.map((q) => (
            <p key={q.key} role="alert" className="mt-2 text-sm font-semibold text-red-600">
              {t('failed', { name: q.name })}
            </p>
          ))}
        </div>

        {notice && (
          <p role="status" className="rounded-xl bg-[#F6FBE8] px-3 py-2 text-sm font-semibold text-stone-900">
            {notice}
          </p>
        )}

        {toSend.length > 0 && (
          <section aria-label={t('whatsappTitle')} data-testid="whatsapp-send">
            <h2 className="text-[15px] font-extrabold text-stone-900 dark:text-white">{t('whatsappTitle')}</h2>
            <p className="mb-2 text-xs text-stone-500">{t('whatsappHint')}</p>
            <ul className="divide-y divide-stone-200 dark:divide-tribe-mid">
              {toSend.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-stone-900 dark:text-white">
                      {i.name}
                    </span>
                    <span className="block text-xs text-stone-500">{i.count === 1 ? t('photosOne') : t('photosCount', { count: i.count })}</span>
                  </span>
                  <a
                    href={i.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSent((s) => new Set(s).add(i.id))}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold ${
                      sent.has(i.id) ? 'border-[1.5px] border-stone-300 text-stone-600' : 'bg-[#25D366] text-white'
                    }`}
                  >
                    {sent.has(i.id) ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                    {sent.has(i.id) ? t('whatsappSent') : t('whatsappSend')}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.length === 0 && queue.length === 0 ? (
          <p className="text-center text-sm text-stone-500">{t('emptyHint')}</p>
        ) : (
          <>
            {untagged.length > 0 && (
              <section aria-label={t('untagged')}>
                <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-extrabold text-stone-900 dark:text-white">
                  {t('untagged')} <span className="text-sm font-normal text-stone-500">{untagged.length}</span>
                </h2>
                <div className="grid grid-cols-3 gap-1.5">{untagged.map(tile)}</div>
              </section>
            )}
            {tagged.length > 0 && (
              <section aria-label={t('tagged')}>
                <h2 className="mb-2 flex items-baseline gap-2 text-[15px] font-extrabold text-stone-900 dark:text-white">
                  {t('tagged')} <span className="text-sm font-normal text-stone-500">{tagged.length}</span>
                </h2>
                <div className="grid grid-cols-3 gap-1.5">{tagged.map(tile)}</div>
              </section>
            )}
          </>
        )}
      </main>

      {items.length > 0 && (
        <div
          data-testid="moments-bar"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-[#F7F8F6]/95 backdrop-blur dark:border-tribe-mid dark:bg-tribe-card/95"
          style={{ paddingBottom: 'var(--safe-area-inset-bottom, 0px)' }}
        >
          <div className="mx-auto max-w-2xl space-y-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelected(selected.size === items.length ? new Set() : new Set(items.map((m) => m.id)))
                }
                className="rounded-xl border-[1.5px] border-stone-900 bg-white px-3 py-2.5 text-sm font-bold text-stone-900"
              >
                {selected.size === items.length ? t('clearSelection') : t('selectAll')}
              </button>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => {
                  setPickerKey((k) => k + 1);
                  setPickerOpen(true);
                }}
                className="flex-1 rounded-xl bg-stone-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"
              >
                {t('tagTo')}
                {selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  aria-label={t('delete')}
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-xl border-[1.5px] border-red-600 px-3 py-2.5 text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              disabled={pending === 0 || delivering}
              onClick={deliver}
              className="w-full rounded-xl bg-[#A8DA36] py-3 text-[15px] font-extrabold text-stone-900 disabled:opacity-50"
            >
              {t('deliver')}
              {pending > 0 ? ` · ${t('deliverHint', { people: pending })}` : ''}
            </button>
            {pending === 0 && <p className="text-center text-xs text-stone-500">{t('nothingToDeliver')}</p>}
          </div>
        </div>
      )}

      {pickerOpen && (
        <TagPicker
          key={pickerKey}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          people={people}
          selected={selectedItems}
          onApply={applyTags}
          onCreateInvite={createInvite}
          startWithInvite={openPicker === 'invite' && pickerKey === 0}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('delete')}
        message={t('deleteConfirm', { count: selected.size })}
        confirmLabel={t('delete')}
        cancelLabel={t('back')}
        variant="danger"
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
